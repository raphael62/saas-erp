import type { Stripe } from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Persist Stripe subscription state onto organizations (service role; used from webhooks).
 */
export async function syncStripeSubscriptionToOrganization(
  subscription: Stripe.Subscription,
  orgIdOverride?: string | null
): Promise<{ ok: boolean; error?: string }> {
  const orgId =
    orgIdOverride ?? subscription.metadata?.organization_id?.trim() ?? null;
  if (!orgId) return { ok: false, error: "missing organization_id" };

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id ?? null;

  const trialEnd = subscription.trial_end
    ? new Date(subscription.trial_end * 1000).toISOString()
    : null;
  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null;

  const tier = subscription.metadata?.subscription_tier?.trim();
  const admin = createAdminClient();
  const updates: Record<string, unknown> = {
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    subscription_status: subscription.status,
    trial_ends_at: trialEnd,
    subscription_ends_at: periodEnd,
  };
  if (tier) updates.subscription_tier = tier;

  const { error } = await admin.from("organizations").update(updates).eq("id", orgId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
