"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function getOrgContext() {
  const { getOrgContextForAction } = await import("@/lib/org-context");
  const ctx = await getOrgContextForAction();
  if (!ctx.ok) return { supabase: ctx.supabase, user: null, orgId: null as string | null, error: ctx.error };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user: user ?? null, orgId: ctx.orgId, error: null as string | null };
}

function parseNumber(value: FormDataEntryValue | null, fallback = 0) {
  const raw = String(value ?? "").replace(/,/g, "").trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function parseList(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return [] as string[];
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function collectRuleIndexes(formData: FormData) {
  const indexes = new Set<string>();
  for (const [key] of formData.entries()) {
    if (key.startsWith("rule_buy_product_id_")) indexes.add(key.replace("rule_buy_product_id_", ""));
  }
  return Array.from(indexes).sort((a, b) => Number(a) - Number(b));
}

export async function savePromotion(formData: FormData) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const id = String(formData.get("id") ?? "").trim() || null;
  const promoCode = String(formData.get("promo_code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const startDate = String(formData.get("start_date") ?? "").trim();
  const endDate = String(formData.get("end_date") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const promoBudget = String(formData.get("promo_budget_cartons") ?? "").trim();
  const isActive = String(formData.get("is_active") ?? "true") !== "false";
  const eligiblePriceTypes = parseList(formData.get("eligible_price_types"));
  const eligibleLocationIds = parseList(formData.get("eligible_location_ids"));
  const daysOfWeek = parseList(formData.get("days_of_week"))
    .map((x) => Number(x))
    .filter((x) => Number.isInteger(x) && x >= 0 && x <= 6);
  const happyHourStart = String(formData.get("happy_hour_start") ?? "").trim() || null;
  const happyHourEnd = String(formData.get("happy_hour_end") ?? "").trim() || null;

  if (!promoCode) return { error: "Promo code is required." };
  if (!name) return { error: "Name is required." };
  if (!startDate || !endDate) return { error: "Start and end dates are required." };

  const promotionData = {
    promo_code: promoCode,
    name,
    promo_budget_cartons: promoBudget ? parseNumber(promoBudget, 0) : null,
    start_date: startDate,
    end_date: endDate,
    description,
    is_active: isActive,
    eligible_price_types: eligiblePriceTypes,
    eligible_location_ids: eligibleLocationIds,
    days_of_week: daysOfWeek,
    happy_hour_start: happyHourStart,
    happy_hour_end: happyHourEnd,
  };

  let promotionId = id;
  if (promotionId) {
    const { error: updateError } = await supabase
      .from("promotions")
      .update(promotionData)
      .eq("organization_id", orgId)
      .eq("id", promotionId);
    if (updateError) return { error: updateError.message };
  } else {
    const { data, error: insertError } = await supabase
      .from("promotions")
      .insert({
        organization_id: orgId,
        ...promotionData,
      })
      .select("id")
      .single();
    if (insertError) return { error: insertError.message };
    promotionId = data?.id ?? null;
    if (!promotionId) return { error: "Failed to create promotion." };
  }

  const indexes = collectRuleIndexes(formData).slice(0, 1);
  const rules = indexes
    .map((idx, rowNo) => {
      const buyProductId = String(formData.get(`rule_buy_product_id_${idx}`) ?? "").trim();
      const rewardProductId = String(formData.get(`rule_reward_product_id_${idx}`) ?? "").trim();
      const buyQty = parseNumber(formData.get(`rule_buy_qty_${idx}`), 0);
      const rewardQty = parseNumber(formData.get(`rule_reward_qty_${idx}`), 0);
      const buyUnit = String(formData.get(`rule_buy_unit_${idx}`) ?? "cartons").trim().toLowerCase();
      const rewardUnit = String(formData.get(`rule_reward_unit_${idx}`) ?? "cartons").trim().toLowerCase();
      if (!buyProductId || !rewardProductId || buyQty <= 0 || rewardQty <= 0) return null;
      return {
        organization_id: orgId,
        promotion_id: promotionId!,
        buy_product_id: buyProductId,
        buy_qty: buyQty,
        buy_unit: buyUnit === "bottles" ? "bottles" : "cartons",
        reward_product_id: rewardProductId,
        reward_qty: rewardQty,
        reward_unit: rewardUnit === "bottles" ? "bottles" : "cartons",
        row_no: rowNo,
      };
    })
    .filter(Boolean);

  const { error: clearRulesError } = await supabase
    .from("promotion_rules")
    .delete()
    .eq("organization_id", orgId)
    .eq("promotion_id", promotionId);
  if (clearRulesError) return { error: clearRulesError.message };

  if (rules.length > 0) {
    const { error: insertRulesError } = await supabase.from("promotion_rules").insert(rules);
    if (insertRulesError) return { error: insertRulesError.message };
  }

  revalidatePath("/dashboard/sales/promotions");
  revalidatePath("/dashboard/sales/sales-invoices");
  revalidatePath("/dashboard/sales");
  return { ok: true, id: promotionId };
}

export async function deletePromotion(id: string) {
  const { supabase, orgId, error } = await getOrgContext();
  if (error || !orgId) return { error: error ?? "Unauthorized" };

  const promotionId = String(id ?? "").trim();
  if (!promotionId) return { error: "Missing promotion id." };

  const { error: rulesError } = await supabase
    .from("promotion_rules")
    .delete()
    .eq("organization_id", orgId)
    .eq("promotion_id", promotionId);
  if (rulesError) return { error: rulesError.message };

  const { error: deleteError } = await supabase
    .from("promotions")
    .delete()
    .eq("organization_id", orgId)
    .eq("id", promotionId);
  if (deleteError) return { error: deleteError.message };

  revalidatePath("/dashboard/sales/promotions");
  revalidatePath("/dashboard/sales/sales-invoices");
  revalidatePath("/dashboard/sales");
  return { ok: true };
}
