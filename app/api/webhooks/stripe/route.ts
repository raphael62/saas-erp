import { NextResponse } from "next/server";
import Stripe from "stripe";
import { syncStripeSubscriptionToOrganization } from "@/lib/stripe-subscription-sync";

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

export async function POST(request: Request) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret || !sig) {
    return NextResponse.json({ error: "Missing webhook secret or signature" }, { status: 400 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 503 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Webhook signature verification failed: ${message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription") break;
        const subField = session.subscription;
        const subId = typeof subField === "string" ? subField : subField?.id;
        if (!subId) break;
        const sub = await stripe.subscriptions.retrieve(subId);
        const orgId = session.client_reference_id ?? session.metadata?.organization_id ?? null;
        await syncStripeSubscriptionToOrganization(sub, orgId);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await syncStripeSubscriptionToOrganization(subscription);
        break;
      }
      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subField = invoice.subscription;
        const subId = typeof subField === "string" ? subField : subField?.id;
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          await syncStripeSubscriptionToOrganization(sub);
        }
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.error("[Stripe webhook] handler error:", e);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
