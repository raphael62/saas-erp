"use server";

import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import {
  getStripePriceIdForTier,
  isStripeBillingConfigured,
  isSubscriptionTierId,
  TRIAL_PERIOD_DAYS,
} from "@/lib/subscription-tiers";

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key);
}

export async function getStripeBillingConfigured(): Promise<boolean> {
  return isStripeBillingConfigured();
}

/**
 * After complete_registration: redirect new org owner to Stripe Checkout.
 * 14-day trial, no subscription charge until trial ends; subscriber can cancel before then in Stripe Customer Portal or Dashboard.
 */
export async function createRegistrationCheckoutSession(
  tierKey: string
): Promise<{ url?: string; error?: string }> {
  if (!isSubscriptionTierId(tierKey)) return { error: "Invalid plan selected." };
  const priceId = getStripePriceIdForTier(tierKey);
  if (!priceId) {
    return {
      error: "Billing is not configured. Set STRIPE_PRICE_STARTER, _GROWTH, _BUSINESS, _ENTERPRISE in the server environment.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { error: "You must be signed in to continue." };

  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();
  if (profErr || !profile?.organization_id) return { error: "No organization found for this account." };

  const orgId = profile.organization_id as string;
  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .select("created_by, subscription_tier")
    .eq("id", orgId)
    .single();
  if (orgErr || !org) return { error: "Organization not found." };

  const createdBy = (org as { created_by?: string | null }).created_by;
  if (createdBy !== user.id) return { error: "Only the organization owner can start the subscription checkout." };

  const tierOnOrg = (org as { subscription_tier?: string | null }).subscription_tier;
  if (tierOnOrg && tierOnOrg !== tierKey) {
    return { error: "Selected plan does not match your signup choice. Go back and pick the same plan, or contact support." };
  }

  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: user.email ?? undefined,
      client_reference_id: orgId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: TRIAL_PERIOD_DAYS,
        metadata: {
          organization_id: orgId,
          subscription_tier: tierKey,
        },
      },
      metadata: {
        organization_id: orgId,
        subscription_tier: tierKey,
      },
      success_url: `${base}/register/billing-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/register?billing=canceled`,
    });

    if (!session.url) return { error: "Could not create a checkout session." };
    return { url: session.url };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Stripe error";
    return { error: msg };
  }
}
