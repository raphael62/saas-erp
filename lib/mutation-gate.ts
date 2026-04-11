import { getOrgContextForAction } from "@/lib/org-context";
import { canAccess, type PermissionAction } from "@/lib/permissions";
import type { createClient } from "@/lib/supabase/server";

export type OrgMutationGateOk = {
  ok: true;
  userId: string;
  orgId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
};

export type OrgMutationGateFail = { ok: false; error: string };

export type OrgMutationGateResult = OrgMutationGateOk | OrgMutationGateFail;

const FORBIDDEN = "You don't have permission to perform this action.";

export async function gateModulePageAction(
  moduleKey: string,
  pageKey: string | null,
  action: PermissionAction
): Promise<OrgMutationGateResult> {
  const ctx = await getOrgContextForAction();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  if (!(await canAccess(ctx.userId, moduleKey, pageKey, action))) {
    return { ok: false, error: FORBIDDEN };
  }
  return { ok: true, userId: ctx.userId, orgId: ctx.orgId, supabase: ctx.supabase };
}

export async function gateModulePageAnyAction(
  moduleKey: string,
  pageKey: string | null,
  actions: PermissionAction[]
): Promise<OrgMutationGateResult> {
  const ctx = await getOrgContextForAction();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  for (const action of actions) {
    if (await canAccess(ctx.userId, moduleKey, pageKey, action)) {
      return { ok: true, userId: ctx.userId, orgId: ctx.orgId, supabase: ctx.supabase };
    }
  }
  return { ok: false, error: FORBIDDEN };
}

export async function gateSalesPageAction(pageKey: string, action: PermissionAction): Promise<OrgMutationGateResult> {
  return gateModulePageAction("sales", pageKey, action);
}

export async function gateSalesPageAnyAction(pageKey: string, actions: PermissionAction[]): Promise<OrgMutationGateResult> {
  return gateModulePageAnyAction("sales", pageKey, actions);
}

/** Customer Payments is listed under Sales and Accounting; allow if either module grants. */
export async function gateCustomerPaymentsAction(action: PermissionAction): Promise<OrgMutationGateResult> {
  const ctx = await getOrgContextForAction();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  if (
    (await canAccess(ctx.userId, "sales", "customer-payments", action)) ||
    (await canAccess(ctx.userId, "accounting", "customer-payments", action))
  ) {
    return { ok: true, userId: ctx.userId, orgId: ctx.orgId, supabase: ctx.supabase };
  }
  return { ok: false, error: FORBIDDEN };
}

export async function gateSalesAnyPageAction(
  specs: { pageKey: string; action: PermissionAction }[]
): Promise<OrgMutationGateResult> {
  const ctx = await getOrgContextForAction();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  for (const s of specs) {
    if (await canAccess(ctx.userId, "sales", s.pageKey, s.action)) {
      return { ok: true, userId: ctx.userId, orgId: ctx.orgId, supabase: ctx.supabase };
    }
  }
  return { ok: false, error: FORBIDDEN };
}
