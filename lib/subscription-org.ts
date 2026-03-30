import type { NavbarSubscription } from "@/components/dashboard/top-navbar";

export type OrgBillingRow = {
  subscription_ends_at?: string | null;
  trial_ends_at?: string | null;
  subscription_status?: string | null;
};

/**
 * Derive navbar subscription pill from org billing columns (Stripe-synced).
 * Trial: status trialing + future trial_ends_at.
 * Paid period: subscription_ends_at (current_period_end from Stripe).
 */
export function navbarSubscriptionFromOrg(row: OrgBillingRow | null | undefined): NavbarSubscription {
  if (!row) return { kind: "none" };

  const now = Date.now();
  const status = (row.subscription_status ?? "").toLowerCase();

  if (status === "trialing" && row.trial_ends_at) {
    const endMs = new Date(row.trial_ends_at).getTime();
    if (!Number.isNaN(endMs) && endMs > now) {
      const daysLeft = Math.max(1, Math.ceil((endMs - now) / 86400000));
      return { kind: "trial", daysLeft };
    }
  }

  if (
    status === "canceled" ||
    status === "unpaid" ||
    status === "incomplete_expired" ||
    status === "paused"
  ) {
    return { kind: "expired" };
  }

  if (row.subscription_ends_at) {
    const endMs = new Date(row.subscription_ends_at).getTime();
    if (Number.isNaN(endMs)) return { kind: "none" };
    if (endMs <= now) {
      if (status === "active" || status === "past_due") return { kind: "expired" };
      return { kind: "expired" };
    }
    const daysLeft = Math.max(1, Math.ceil((endMs - now) / 86400000));
    return { kind: "active", daysLeft };
  }

  if (status === "active" || status === "past_due") {
    return { kind: "none" };
  }

  return { kind: "none" };
}
