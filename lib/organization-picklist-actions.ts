"use server";

import { createClient } from "@/lib/supabase/server";
import type { PicklistKey } from "@/lib/organization-picklist-keys";

function norm(s: string) {
  return s.trim().toLowerCase();
}

/**
 * Merges saved pick list + invoice-derived hints, minus suppressed (removed) invoice-only names.
 */
export async function getMergedPicklist(
  organizationId: string,
  listKey: PicklistKey,
  invoiceHints: string[]
): Promise<{ values: string[]; error?: string }> {
  const supabase = await createClient();
  const { data: row, error: rowErr } = await supabase
    .from("organization_picklists")
    .select("values")
    .eq("organization_id", organizationId)
    .eq("list_key", listKey)
    .maybeSingle();

  if (rowErr) return { values: [], error: rowErr.message };

  const { data: supRows, error: supErr } = await supabase
    .from("organization_picklist_suppressions")
    .select("value_norm")
    .eq("organization_id", organizationId)
    .eq("list_key", listKey);

  if (supErr) return { values: [], error: supErr.message };

  const suppressed = new Set((supRows ?? []).map((r: { value_norm: string }) => r.value_norm));
  const saved = (row?.values as string[] | null) ?? [];

  const merged = new Map<string, string>();
  for (const v of [...saved, ...invoiceHints]) {
    const t = String(v ?? "").trim();
    if (!t) continue;
    const n = norm(t);
    if (suppressed.has(n)) continue;
    if (!merged.has(n)) merged.set(n, t);
  }

  const values = Array.from(merged.values()).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
  return { values };
}

/**
 * Persists the full list the user sees and updates suppressions for invoice-only names they removed.
 */
export async function savePicklist(
  organizationId: string,
  listKey: PicklistKey,
  desiredList: string[],
  invoiceHints: string[]
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const desired = desiredList.map((x) => String(x ?? "").trim()).filter(Boolean);
  const desiredNorm = new Set(desired.map(norm));

  const { error: upErr } = await supabase.from("organization_picklists").upsert(
    {
      organization_id: organizationId,
      list_key: listKey,
      values: desired,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,list_key" }
  );
  if (upErr) return { error: upErr.message };

  for (const inv of invoiceHints) {
    const t = String(inv ?? "").trim();
    if (!t) continue;
    const n = norm(t);
    if (!desiredNorm.has(n)) {
      const { error: insErr } = await supabase.from("organization_picklist_suppressions").insert({
        organization_id: organizationId,
        list_key: listKey,
        value_norm: n,
      });
      if (insErr && insErr.code !== "23505") return { error: insErr.message };
    } else {
      const { error: delErr } = await supabase
        .from("organization_picklist_suppressions")
        .delete()
        .eq("organization_id", organizationId)
        .eq("list_key", listKey)
        .eq("value_norm", n);
      if (delErr) return { error: delErr.message };
    }
  }

  return {};
}
