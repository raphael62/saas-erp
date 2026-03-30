/**
 * Four subscription tiers at registration. Map each to a Stripe Price ID in env.
 * @see docs/subscription-stripe.md
 */

export const TRIAL_PERIOD_DAYS = 14;

export const SUBSCRIPTION_TIER_IDS = ["starter", "growth", "business", "enterprise"] as const;
export type SubscriptionTierId = (typeof SUBSCRIPTION_TIER_IDS)[number];

export function isSubscriptionTierId(value: string): value is SubscriptionTierId {
  return (SUBSCRIPTION_TIER_IDS as readonly string[]).includes(value);
}

/** Server-only: Stripe Price IDs from environment. */
export function getStripePriceIdForTier(tier: SubscriptionTierId): string | null {
  const envMap: Record<SubscriptionTierId, string | undefined> = {
    starter: process.env.STRIPE_PRICE_STARTER,
    growth: process.env.STRIPE_PRICE_GROWTH,
    business: process.env.STRIPE_PRICE_BUSINESS,
    enterprise: process.env.STRIPE_PRICE_ENTERPRISE,
  };
  const id = envMap[tier]?.trim();
  return id && id.length > 0 ? id : null;
}

export function isStripeBillingConfigured(): boolean {
  return SUBSCRIPTION_TIER_IDS.some((t) => getStripePriceIdForTier(t) !== null);
}

/** Labels for register UI (safe for client). */
export const SUBSCRIPTION_TIER_OPTIONS: {
  id: SubscriptionTierId;
  name: string;
  blurb: string;
}[] = [
  { id: "starter", name: "Starter", blurb: "Small teams getting started." },
  { id: "growth", name: "Growth", blurb: "Growing operations." },
  { id: "business", name: "Business", blurb: "Full-featured for established businesses." },
  { id: "enterprise", name: "Enterprise", blurb: "Maximum scale and support." },
];
