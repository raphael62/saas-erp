"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { hasFullAccess } from "@/lib/roles";

async function getContext() {
  const { getOrgContextForAction } = await import("@/lib/org-context");
  const ctx = await getOrgContextForAction();
  if (!ctx.ok) {
    const isUnauth = ctx.error === "Unauthorized";
    return {
      error: isUnauth ? ("Unauthorized" as const) : ("No organization" as const),
      supabase: isUnauth ? null : ctx.supabase,
      userId: ctx.userId ?? null,
      orgId: null,
    };
  }
  const { userId, orgId, supabase } = ctx;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).single();
  const role = (profile as { role?: string | null } | null)?.role ?? null;
  const { data: org } = await supabase.from("organizations").select("created_by").eq("id", orgId).single();
  const isOwner = (org as { created_by?: string | null } | null)?.created_by === userId;
  const canManage = hasFullAccess(role) || isOwner;
  if (!canManage)
    return { error: "Forbidden" as const, supabase: null, userId, orgId: null };
  return { error: null, supabase, userId, orgId };
}

export type UserRow = {
  id: string;
  user_code: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  /** All assigned RBAC role ids (profile_roles + legacy profiles.role_id). */
  role_ids: string[];
  /** First role id when sorted by name — used for the quick-assign dropdown. */
  role_id: string | null;
  /** Comma-separated role names for display. */
  role_name: string | null;
};

export type RoleOption = { id: string; name: string };

export async function listUsers(): Promise<{ users: UserRow[]; error?: string }> {
  const ctx = await getContext();
  if (ctx.error) return { users: [], error: ctx.error };
  if (!ctx.supabase || !ctx.orgId) return { users: [] };

  const { data: profiles, error: profError } = await ctx.supabase
    .from("profiles")
    .select("id, user_code, full_name, email, phone, role_id")
    .eq("organization_id", ctx.orgId)
    .order("full_name");

  if (profError) return { users: [], error: profError.message };
  if (!profiles?.length) return { users: [] };

  const profList = profiles as {
    id: string;
    user_code?: string | null;
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
    role_id?: string | null;
  }[];

  const profileIds = profList.map((p) => p.id);
  const { data: prLinks } = await ctx.supabase
    .from("profile_roles")
    .select("profile_id, role_id")
    .in("profile_id", profileIds);

  const rolesByProfile = new Map<string, string[]>();
  for (const row of prLinks ?? []) {
    const pid = (row as { profile_id: string; role_id: string }).profile_id;
    const rid = (row as { profile_id: string; role_id: string }).role_id;
    const arr = rolesByProfile.get(pid) ?? [];
    arr.push(rid);
    rolesByProfile.set(pid, arr);
  }

  const allRidSet = new Set<string>();
  for (const p of profList) {
    const fromJoin = rolesByProfile.get(p.id) ?? [];
    const ids = fromJoin.length > 0 ? fromJoin : p.role_id ? [p.role_id] : [];
    ids.forEach((id) => allRidSet.add(id));
  }

  let roleMap: Record<string, string> = {};
  const allRids = [...allRidSet];
  if (allRids.length > 0) {
    const { data: roles } = await ctx.supabase.from("roles").select("id, name").in("id", allRids);
    roleMap = (roles ?? []).reduce<Record<string, string>>((acc, r) => {
      acc[r.id] = r.name;
      return acc;
    }, {});
  }

  return {
    users: profList.map((p) => {
      let role_ids = rolesByProfile.get(p.id) ?? [];
      if (role_ids.length === 0 && p.role_id) role_ids = [p.role_id];
      const names = role_ids.map((id) => roleMap[id]).filter(Boolean);
      names.sort((a, b) => a.localeCompare(b));
      const sortedIds = [...role_ids].sort((a, b) =>
        (roleMap[a] ?? a).localeCompare(roleMap[b] ?? b)
      );
      return {
        id: p.id,
        user_code: p.user_code ?? null,
        full_name: p.full_name ?? null,
        email: p.email ?? null,
        phone: p.phone ?? null,
        role_ids,
        role_id: sortedIds[0] ?? null,
        role_name: names.length > 0 ? names.join(", ") : null,
      };
    }),
  };
}

export async function listRolesForSelect(): Promise<{ roles: RoleOption[]; error?: string }> {
  const ctx = await getContext();
  if (ctx.error) return { roles: [], error: ctx.error };
  if (!ctx.supabase || !ctx.orgId) return { roles: [] };

  const { data: roles, error } = await ctx.supabase
    .from("roles")
    .select("id, name")
    .eq("organization_id", ctx.orgId)
    .eq("is_active", true)
    .order("name");

  if (error) return { roles: [], error: error.message };
  return {
    roles: (roles ?? []).map((r) => ({ id: r.id, name: r.name })),
  };
}

export async function inviteUser(email: string, fullName?: string): Promise<{ error?: string; code?: string }> {
  const ctx = await getContext();
  if (ctx.error) return { error: ctx.error };
  if (!ctx.supabase || !ctx.orgId) return { error: "No organization" };

  const trimmed = email?.trim();
  if (!trimmed) return { error: "Email is required" };

  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();

    const { data: org } = await admin
      .from("organizations")
      .select("code")
      .eq("id", ctx.orgId)
      .single();
    const code = (org as { code?: string } | null)?.code ?? null;

    const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/auth/callback`;
    const { data, error } = await admin.auth.admin.inviteUserByEmail(trimmed, {
      data: {
        organization_id: ctx.orgId,
        full_name: fullName?.trim() ?? "",
        company_code: code ?? "",
      },
      redirectTo,
    });

    if (error) return { error: error.message };

    const userId = data?.user?.id;
    if (userId) {
      await admin.from("profiles").update({ organization_id: ctx.orgId, full_name: fullName?.trim() || null }).eq("id", userId);
    }

    revalidatePath("/dashboard/settings/users");
    return { code: code ?? undefined };
  } catch (err) {
    if (err instanceof Error && err.message.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      return { error: "Add SUPABASE_SERVICE_ROLE_KEY to .env.local" };
    }
    return { error: err instanceof Error ? err.message : "Failed to invite user" };
  }
}

async function replaceProfileRoles(
  admin: Awaited<ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>>,
  orgId: string,
  profileId: string,
  roleIds: string[]
) {
  await admin.from("profile_roles").delete().eq("profile_id", profileId).eq("organization_id", orgId);
  const unique = [...new Set(roleIds)];
  if (unique.length === 0) return;
  await admin.from("profile_roles").insert(
    unique.map((role_id) => ({
      profile_id: profileId,
      role_id,
      organization_id: orgId,
    }))
  );
}

export async function updateUserRole(
  userId: string,
  roleId: string | null
): Promise<{ error?: string }> {
  const ctx = await getContext();
  if (ctx.error) return { error: ctx.error };
  if (!ctx.orgId) return { error: "No organization" };

  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("organization_id")
      .eq("id", userId)
      .single();
    if (!profile || (profile as { organization_id: string }).organization_id !== ctx.orgId) {
      return { error: "User not found in your organization." };
    }

    await replaceProfileRoles(admin, ctx.orgId, userId, roleId ? [roleId] : []);
    const { error } = await admin
      .from("profiles")
      .update({ role_id: roleId })
      .eq("id", userId)
      .eq("organization_id", ctx.orgId);
    if (error) return { error: error.message };
    revalidatePath("/dashboard/settings/users");
    revalidatePath("/dashboard/settings/roles-permissions");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update role" };
  }
}

export type ProvisioningPickItem = { id: string; code: string | null; name: string };

export async function listProvisioningPicklists(): Promise<{
  locations: ProvisioningPickItem[];
  paymentAccounts: ProvisioningPickItem[];
  salesReps: ProvisioningPickItem[];
  error?: string;
}> {
  const ctx = await getContext();
  if (ctx.error) return { locations: [], paymentAccounts: [], salesReps: [], error: ctx.error };
  if (!ctx.supabase || !ctx.orgId) return { locations: [], paymentAccounts: [], salesReps: [] };

  const [locRes, paRes, srRes] = await Promise.all([
    ctx.supabase
      .from("locations")
      .select("id, code, name")
      .eq("organization_id", ctx.orgId)
      .eq("is_active", true)
      .order("code"),
    ctx.supabase
      .from("payment_accounts")
      .select("id, code, name")
      .eq("organization_id", ctx.orgId)
      .eq("is_active", true)
      .order("code"),
    ctx.supabase
      .from("sales_reps")
      .select("id, code, name")
      .eq("organization_id", ctx.orgId)
      .eq("is_active", true)
      .order("name"),
  ]);

  const err = locRes.error?.message ?? paRes.error?.message ?? srRes.error?.message;
  if (err) return { locations: [], paymentAccounts: [], salesReps: [], error: err };

  const mapRows = (rows: { id: string; code?: string | null; name: string }[] | null): ProvisioningPickItem[] =>
    (rows ?? []).map((r) => ({ id: r.id, code: r.code ?? null, name: r.name }));

  return {
    locations: mapRows(locRes.data as { id: string; code?: string | null; name: string }[] | null),
    paymentAccounts: mapRows(paRes.data as { id: string; code?: string | null; name: string }[] | null),
    salesReps: mapRows(srRes.data as { id: string; code?: string | null; name: string }[] | null),
  };
}

export type UserProvisioningDetail = {
  id: string;
  email: string | null;
  user_code: string | null;
  full_name: string | null;
  phone: string | null;
  role: string | null;
  /** Assigned organization roles (RBAC). */
  role_ids: string[];
  default_location_id: string | null;
  linked_sales_rep_id: string | null;
  location_ids: string[];
  payment_account_ids: string[];
};

export async function getUserProvisioningDetail(userId: string): Promise<{
  detail?: UserProvisioningDetail;
  error?: string;
}> {
  const ctx = await getContext();
  if (ctx.error) return { error: ctx.error };
  if (!ctx.orgId) return { error: "No organization" };

  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();

    const { data: profile, error: pErr } = await admin
      .from("profiles")
      .select(
        "id, email, user_code, full_name, phone, role, role_id, organization_id, default_location_id, linked_sales_rep_id"
      )
      .eq("id", userId)
      .single();
    if (pErr || !profile) return { error: pErr?.message ?? "User not found" };
    if ((profile as { organization_id?: string }).organization_id !== ctx.orgId) {
      return { error: "User not in your organization" };
    }

    const { data: locRows } = await admin
      .from("profile_user_locations")
      .select("location_id")
      .eq("profile_id", userId)
      .eq("organization_id", ctx.orgId);
    const { data: payRows } = await admin
      .from("profile_payment_accounts")
      .select("payment_account_id")
      .eq("profile_id", userId)
      .eq("organization_id", ctx.orgId);

    const { data: roleRows } = await admin
      .from("profile_roles")
      .select("role_id")
      .eq("profile_id", userId)
      .eq("organization_id", ctx.orgId);

    const pr = profile as {
      id: string;
      email?: string | null;
      user_code?: string | null;
      full_name?: string | null;
      phone?: string | null;
      role?: string | null;
      role_id?: string | null;
      default_location_id?: string | null;
      linked_sales_rep_id?: string | null;
    };

    let role_ids = (roleRows ?? []).map((r: { role_id: string }) => r.role_id);
    if (role_ids.length === 0 && pr.role_id) role_ids = [pr.role_id];

    return {
      detail: {
        id: pr.id,
        email: pr.email ?? null,
        user_code: pr.user_code ?? null,
        full_name: pr.full_name ?? null,
        phone: pr.phone ?? null,
        role: pr.role ?? null,
        role_ids,
        default_location_id: pr.default_location_id ?? null,
        linked_sales_rep_id: pr.linked_sales_rep_id ?? null,
        location_ids: (locRows ?? []).map((r: { location_id: string }) => r.location_id),
        payment_account_ids: (payRows ?? []).map((r: { payment_account_id: string }) => r.payment_account_id),
      },
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load user" };
  }
}

export type CreateProvisionedUserInput = {
  userCode: string;
  fullName: string;
  phone?: string;
  email: string;
  password: string;
  roleIds: string[];
  makeAdmin: boolean;
  locationIds: string[];
  primaryLocationId: string | null;
  paymentAccountIds: string[];
  salesRepId: string | null;
  sendPasswordResetEmail: boolean;
};

async function resolveAdminRoleId(
  admin: Awaited<ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>>,
  orgId: string
): Promise<string | null> {
  const { data: roles } = await admin
    .from("roles")
    .select("id, name")
    .eq("organization_id", orgId)
    .eq("is_active", true);
  const list = (roles ?? []) as { id: string; name: string }[];
  const hit =
    list.find((r) => r.name.trim().toLowerCase() === "admin") ??
    list.find((r) => r.name.toLowerCase().includes("admin"));
  return hit?.id ?? null;
}

async function assertIdsBelongToOrg(
  admin: Awaited<ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>>,
  orgId: string,
  roleIds: string[],
  locationIds: string[],
  paymentAccountIds: string[],
  salesRepId: string | null,
  primaryLocationId: string | null
): Promise<string | null> {
  if (roleIds.length > 0) {
    const { count, error } = await admin
      .from("roles")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .in("id", roleIds);
    if (error) return error.message;
    if ((count ?? 0) !== roleIds.length) return "One or more roles are invalid.";
  }
  if (primaryLocationId && !locationIds.includes(primaryLocationId)) {
    return "Primary location must be one of the selected locations.";
  }
  if (locationIds.length > 0) {
    const { count, error } = await admin
      .from("locations")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .in("id", locationIds);
    if (error) return error.message;
    if ((count ?? 0) !== locationIds.length) return "One or more locations are invalid.";
  }
  if (paymentAccountIds.length > 0) {
    const { count, error } = await admin
      .from("payment_accounts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .in("id", paymentAccountIds);
    if (error) return error.message;
    if ((count ?? 0) !== paymentAccountIds.length) return "One or more payment accounts are invalid.";
  }
  if (salesRepId) {
    const { data, error } = await admin
      .from("sales_reps")
      .select("id")
      .eq("organization_id", orgId)
      .eq("id", salesRepId)
      .maybeSingle();
    if (error) return error.message;
    if (!data) return "Sales rep is invalid.";
  }
  return null;
}

async function replaceProfileJoins(
  admin: Awaited<ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>>,
  orgId: string,
  profileId: string,
  locationIds: string[],
  paymentAccountIds: string[]
) {
  await admin.from("profile_user_locations").delete().eq("profile_id", profileId).eq("organization_id", orgId);
  await admin.from("profile_payment_accounts").delete().eq("profile_id", profileId).eq("organization_id", orgId);

  if (locationIds.length > 0) {
    await admin.from("profile_user_locations").insert(
      locationIds.map((location_id) => ({
        profile_id: profileId,
        location_id,
        organization_id: orgId,
      }))
    );
  }
  if (paymentAccountIds.length > 0) {
    await admin.from("profile_payment_accounts").insert(
      paymentAccountIds.map((payment_account_id) => ({
        profile_id: profileId,
        payment_account_id,
        organization_id: orgId,
      }))
    );
  }
}

export async function createProvisionedUser(
  input: CreateProvisionedUserInput
): Promise<{ error?: string; userId?: string; companyCode?: string }> {
  const ctx = await getContext();
  if (ctx.error) return { error: ctx.error };
  if (!ctx.supabase || !ctx.orgId) return { error: "No organization" };

  const email = input.email?.trim().toLowerCase();
  const userCode = input.userCode?.trim();
  const fullName = input.fullName?.trim();
  if (!email) return { error: "Email is required" };
  if (!userCode) return { error: "User code is required" };
  if (!fullName) return { error: "Name is required" };
  if (!input.password || input.password.length < 8) return { error: "Password must be at least 8 characters." };

  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();

    const { data: org } = await admin.from("organizations").select("code").eq("id", ctx.orgId).single();
    const companyCode = (org as { code?: string } | null)?.code ?? "";

    const dup = await admin
      .from("profiles")
      .select("id")
      .eq("organization_id", ctx.orgId)
      .ilike("user_code", userCode)
      .maybeSingle();
    if (dup.data) return { error: "User code is already used in your organization." };

    let roleIds: string[] = [];
    if (input.makeAdmin) {
      const adminRid = await resolveAdminRoleId(admin, ctx.orgId);
      roleIds = adminRid ? [adminRid] : [];
    } else {
      roleIds = [...new Set(input.roleIds)];
    }

    const idErr = await assertIdsBelongToOrg(
      admin,
      ctx.orgId,
      roleIds,
      input.locationIds,
      input.paymentAccountIds,
      input.salesRepId,
      input.primaryLocationId
    );
    if (idErr) return { error: idErr };

    const primaryRoleId = roleIds[0] ?? null;
    const legacyRole = input.makeAdmin ? "admin" : "member";

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        organization_id: ctx.orgId,
        full_name: fullName,
        company_code: companyCode,
      },
    });

    if (cErr) {
      if (cErr.message.toLowerCase().includes("already")) return { error: "This email is already registered." };
      return { error: cErr.message };
    }

    const userId = created.user?.id;
    if (!userId) return { error: "User was not created." };

    const { error: upErr } = await admin
      .from("profiles")
      .update({
        organization_id: ctx.orgId,
        full_name: fullName,
        email,
        user_code: userCode,
        phone: input.phone?.trim() || null,
        role_id: primaryRoleId,
        role: legacyRole,
        default_location_id: input.primaryLocationId,
        linked_sales_rep_id: input.salesRepId,
      })
      .eq("id", userId);
    if (upErr) {
      await admin.auth.admin.deleteUser(userId);
      return { error: upErr.message };
    }

    await replaceProfileJoins(admin, ctx.orgId, userId, input.locationIds, input.paymentAccountIds);
    await replaceProfileRoles(admin, ctx.orgId, userId, roleIds);

    if (input.sendPasswordResetEmail) {
      const { createClient } = await import("@supabase/supabase-js");
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (url && anon) {
        const mailClient = createClient(url, anon);
        await mailClient.auth.resetPasswordForEmail(email, {
          redirectTo: `${appUrl.replace(/\/$/, "")}/auth/update-password`,
        });
      }
    }

    revalidatePath("/dashboard/settings/users");
    return { userId, companyCode: companyCode || undefined };
  } catch (err) {
    if (err instanceof Error && err.message.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      return { error: "Add SUPABASE_SERVICE_ROLE_KEY to .env.local" };
    }
    return { error: err instanceof Error ? err.message : "Failed to create user" };
  }
}

export type UpdateProvisionedUserInput = {
  userId: string;
  userCode: string;
  fullName: string;
  phone?: string;
  roleIds: string[];
  makeAdmin: boolean;
  locationIds: string[];
  primaryLocationId: string | null;
  paymentAccountIds: string[];
  salesRepId: string | null;
};

export async function updateProvisionedUser(input: UpdateProvisionedUserInput): Promise<{ error?: string }> {
  const ctx = await getContext();
  if (ctx.error) return { error: ctx.error };
  if (!ctx.orgId) return { error: "No organization" };

  const userCode = input.userCode?.trim();
  const fullName = input.fullName?.trim();
  if (!userCode) return { error: "User code is required" };
  if (!fullName) return { error: "Name is required" };

  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();

    const { data: profile, error: pErr } = await admin
      .from("profiles")
      .select("id, organization_id")
      .eq("id", input.userId)
      .single();
    if (pErr || !profile) return { error: "User not found" };
    if ((profile as { organization_id: string }).organization_id !== ctx.orgId) {
      return { error: "User not in your organization" };
    }

    const { data: dup } = await admin
      .from("profiles")
      .select("id")
      .eq("organization_id", ctx.orgId)
      .ilike("user_code", userCode)
      .neq("id", input.userId)
      .maybeSingle();
    if (dup) return { error: "User code is already used in your organization." };

    let roleIds: string[] = [];
    if (input.makeAdmin) {
      const adminRid = await resolveAdminRoleId(admin, ctx.orgId);
      roleIds = adminRid ? [adminRid] : [];
    } else {
      roleIds = [...new Set(input.roleIds)];
    }

    const idErr = await assertIdsBelongToOrg(
      admin,
      ctx.orgId,
      roleIds,
      input.locationIds,
      input.paymentAccountIds,
      input.salesRepId,
      input.primaryLocationId
    );
    if (idErr) return { error: idErr };

    const primaryRoleId = roleIds[0] ?? null;
    const legacyRole = input.makeAdmin ? "admin" : "member";

    const { error: upErr } = await admin
      .from("profiles")
      .update({
        full_name: fullName,
        user_code: userCode,
        phone: input.phone?.trim() || null,
        role_id: primaryRoleId,
        role: legacyRole,
        default_location_id: input.primaryLocationId,
        linked_sales_rep_id: input.salesRepId,
      })
      .eq("id", input.userId)
      .eq("organization_id", ctx.orgId);
    if (upErr) return { error: upErr.message };

    await replaceProfileJoins(admin, ctx.orgId, input.userId, input.locationIds, input.paymentAccountIds);
    await replaceProfileRoles(admin, ctx.orgId, input.userId, roleIds);

    revalidatePath("/dashboard/settings/users");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update user" };
  }
}

export async function adminSetUserPassword(
  userId: string,
  newPassword: string
): Promise<{ error?: string }> {
  const ctx = await getContext();
  if (ctx.error) return { error: ctx.error };
  if (!ctx.orgId) return { error: "No organization" };
  if (!newPassword || newPassword.length < 8) return { error: "Password must be at least 8 characters." };
  if (userId === ctx.userId) return { error: "Use account settings to change your own password." };

  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("organization_id")
      .eq("id", userId)
      .single();
    if (!profile || (profile as { organization_id: string }).organization_id !== ctx.orgId) {
      return { error: "User not found in your organization." };
    }
    const { error } = await admin.auth.admin.updateUserById(userId, { password: newPassword });
    if (error) return { error: error.message };
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update password" };
  }
}
