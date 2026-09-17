import Stripe from 'stripe';
import { Order, ProviderConfig } from '../../src/types/index.js';
import { db } from '../db.js';

let stripeClient: Stripe | null = null;
let cachedSecretKey: string | null = null;

export function getStripeClient(secretKeyOverride?: string): Stripe | null {
  const dbConfig = typeof db !== 'undefined' && db?.getStripeConfig ? db.getStripeConfig() : null;
  const secretKey = secretKeyOverride || dbConfig?.secretKey || process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return null; // Handle missing secret key gracefully without crashing process
  }
  if (!stripeClient || cachedSecretKey !== secretKey) {
    stripeClient = new Stripe(secretKey);
    cachedSecretKey = secretKey;
  }
  return stripeClient;
}

export function isStripeConfigured(): boolean {
  const dbConfig = typeof db !== 'undefined' && db?.getStripeConfig ? db.getStripeConfig() : null;
  return Boolean(dbConfig?.secretKey || process.env.STRIPE_SECRET_KEY);
}

export interface CreateCheckoutParams {
  order: Order;
  provider: ProviderConfig;
  successUrl: string;
  cancelUrl: string;
  secretKeyOverride?: string;
}

export interface CreatePaymentIntentParams {
  order: Order;
  provider: ProviderConfig;
  secretKeyOverride?: string;
}

/**
 * Creates a Stripe PaymentIntent using Destination Charges (Platform MoR model).
 * Application Fee = Platform Service Share (15% of service fee).
 * Destination = Provider's Connected Account (85% service + 100% tip).
 */
export async function createStripePaymentIntent(params: CreatePaymentIntentParams): Promise<{ clientSecret: string | null; paymentIntentId: string }> {
  const { order, provider, secretKeyOverride } = params;
  const stripe = getStripeClient(secretKeyOverride);

  if (!stripe) {
    throw new Error('Stripe API Key is not configured.');
  }

  const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
    amount: order.grossTotalCents,
    currency: order.currency.toLowerCase(),
    automatic_payment_methods: {
      enabled: true,
    },
    metadata: {
      orderId: order.id,
      providerId: provider.id,
      serviceId: order.serviceId,
      serviceCents: order.serviceCents.toString(),
      tipCents: order.tipCents.toString(),
      platformTotalShareCents: order.platformTotalShareCents.toString(),
      providerTotalShareCents: order.providerTotalShareCents.toString(),
    },
    description: `GateKeeper Consultation: ${order.serviceName}`,
  };

  const hasConnectedAccount = Boolean(
    provider.stripeAccountId && 
    typeof provider.stripeAccountId === 'string' && 
    provider.stripeAccountId.trim().startsWith('acct_')
  );

  if (hasConnectedAccount) {
    paymentIntentParams.transfer_data = {
      destination: provider.stripeAccountId!.trim(),
    };
    if (order.platformTotalShareCents > 0) {
      paymentIntentParams.application_fee_amount = order.platformTotalShareCents;
    }
  }

  // Use orderId as idempotency key to prevent duplicate intents for the same order
  const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams, {
    idempotencyKey: `pi_create_${order.id}`,
  });

  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
  };
}

/**
 * Creates a Stripe Checkout Session using Destination Charges (Platform MoR model).
 * Application Fee = Platform Service Share (15% of service fee).
 * Destination = Provider's Connected Account (85% service + 100% tip).
 */
export async function createStripeCheckoutSession(params: CreateCheckoutParams): Promise<{ sessionId: string; url: string | null; paymentIntentId?: string }> {
  const { order, provider, successUrl, cancelUrl, secretKeyOverride } = params;
  const stripe = getStripeClient(secretKeyOverride);

  if (!stripe) {
    console.warn('[STRIPE_CHECKOUT] No Stripe client initialized. Missing STRIPE_SECRET_KEY.');
    throw new Error('Stripe API Key is not configured. Please configure your Stripe Secret Key in Admin Settings.');
  }

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    {
      price_data: {
        currency: order.currency.toLowerCase(),
        product_data: {
          name: order.serviceName,
          description: `Anonymous Consultation Session with ${provider.name}`,
        },
        unit_amount: order.serviceCents,
      },
      quantity: 1,
    },
  ];

  if (order.tipCents > 0) {
    lineItems.push({
      price_data: {
        currency: order.currency.toLowerCase(),
        product_data: {
          name: 'Provider Gratuity (100% Provider Direct)',
          description: `Direct tip contribution for ${provider.name}`,
        },
        unit_amount: order.tipCents,
      },
      quantity: 1,
    });
  }

  const paymentIntentData: Stripe.Checkout.SessionCreateParams.PaymentIntentData = {
    metadata: {
      orderId: order.id,
      providerId: provider.id,
      serviceId: order.serviceId,
      serviceCents: order.serviceCents.toString(),
      tipCents: order.tipCents.toString(),
      platformTotalShareCents: order.platformTotalShareCents.toString(),
      providerTotalShareCents: order.providerTotalShareCents.toString(),
    },
  };

  // Only apply transfer_data and application_fee_amount when a valid Connected Account destination exists
  const hasConnectedAccount = Boolean(
    provider.stripeAccountId && 
    typeof provider.stripeAccountId === 'string' && 
    provider.stripeAccountId.trim().startsWith('acct_')
  );

  if (hasConnectedAccount) {
    paymentIntentData.transfer_data = {
      destination: provider.stripeAccountId!.trim(),
    };
    if (order.platformTotalShareCents > 0) {
      paymentIntentData.application_fee_amount = order.platformTotalShareCents;
    }
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: order.id,
      payment_intent_data: paymentIntentData,
      metadata: {
        orderId: order.id,
        providerId: provider.id,
      },
    });

    return {
      sessionId: session.id,
      url: session.url,
      paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id,
    };
  } catch (err: any) {
    // FORENSIC DIAGNOSTIC LOGGING: Do not mask or silently convert Stripe API errors!
    const errorDetails = {
      message: err.message,
      type: err.type,
      code: err.code,
      param: err.param,
      statusCode: err.statusCode || err.status,
      requestId: err.requestId,
      docUrl: err.doc_url,
    };
    console.error('CRITICAL STRIPE CHECKOUT API ERROR:', JSON.stringify(errorDetails, null, 2));
    
    // Throw descriptive error with Stripe diagnostic details
    const stripeErrorCode = err.code || err.type || 'StripeCheckoutError';
    const diagnosticError = new Error(`Stripe API [${stripeErrorCode}]: ${err.message}`);
    (diagnosticError as any).stripeDetails = errorDetails;
    throw diagnosticError;
  }
}

/**
 * Executes Destination Charge Refund with exact reverse_transfer and refund_application_fee options.
 */
export async function executeStripeRefund(params: {
  order: Order;
  refundAmountCents: number;
  isTipRefund?: boolean;
  isServiceRefund?: boolean;
}): Promise<{ refundId: string; reversalId?: string; feeRefundId?: string }> {
  const stripe = getStripeClient();
  const { order, refundAmountCents, isTipRefund, isServiceRefund } = params;

  if (!stripe || !order.stripePaymentIntentId) {
    return { refundId: `re_mock_${order.id}_${Date.now()}` };
  }

  // Full refund logic
  const isFullRefund = refundAmountCents === order.grossTotalCents;
  const wasDestinationCharge = Boolean(order.stripeAccountId && order.stripeAccountId.startsWith('acct_'));

  let reverseTransfer = false;
  let refundApplicationFee = false;

  if (wasDestinationCharge) {
    if (isFullRefund) {
      reverseTransfer = true;
      refundApplicationFee = true;
    } else if (isServiceRefund && !isTipRefund) {
      reverseTransfer = true;
      refundApplicationFee = true;
    } else if (isTipRefund && !isServiceRefund) {
      reverseTransfer = true;
      refundApplicationFee = false;
    }
  }

  const refundParams: Stripe.RefundCreateParams = {
    payment_intent: order.stripePaymentIntentId,
    amount: refundAmountCents,
  };

  if (wasDestinationCharge) {
    refundParams.reverse_transfer = reverseTransfer;
    refundParams.refund_application_fee = refundApplicationFee;
  }

  const refund = await stripe.refunds.create(refundParams);

  return {
    refundId: refund.id,
  };
}

export function verifyStripeWebhookSignature(rawBody: string | Buffer, signature: string, customWebhookSecret?: string): Stripe.Event | null {
  const webhookSecret = customWebhookSecret || process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return null;
  }

  try {
    const stripe = getStripeClient();
    if (stripe) {
      return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    }
    return Stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err);
    return null;
  }
}
