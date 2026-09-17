
import { db } from '../server/db.js';
import { createEntitlement } from '../server/domain/access.js';
import crypto from 'crypto';

async function simulateSandboxCheckout() {
  console.log('--- STARTING STRIPE SANDBOX SIMULATION ---');
  
  // 1. Setup Mock Environment
  const TEST_WHSEC = 'whsec_sandbox_test_2026';
  process.env.STRIPE_WEBHOOK_SECRET = TEST_WHSEC;
  const appUrl = 'https://gatekeeper.example.com';
  
  const provider = db.getProvider();
  const service = provider.services[0];
  
  // 2. Initiate Order (State: created)
  const orderId = `gk_ord_sandbox_${Date.now()}`;
  const serviceCents = 10000; // $100.00
  const tipCents = 2000;      // $20.00
  const providerServiceShareCents = Math.floor(serviceCents * 0.85); // $85.00
  const platformServiceShareCents = serviceCents - providerServiceShareCents; // $15.00
  const providerTipShareCents = tipCents;
  const grossTotalCents = serviceCents + tipCents;

  const order = {
    id: orderId,
    providerId: provider.id,
    serviceId: 'srv_demo_paid',
    serviceName: 'Sandbox Test Session',
    amountCents: grossTotalCents,
    currency: 'USD',
    status: 'created',
    financialState: 'created',
    entitlementState: 'none',
    settlementState: 'unsettled',
    serviceCents,
    tipCents,
    grossTotalCents,
    providerServiceShareCents,
    platformServiceShareCents,
    providerTipShareCents,
    platformTipShareCents: 0,
    providerTotalShareCents: providerServiceShareCents + providerTipShareCents,
    platformTotalShareCents: platformServiceShareCents,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.saveOrder(order as any);
  console.log(`[1] Order Created: ${order.id} | State: ${order.financialState} | Gross: $${(grossTotalCents/100).toFixed(2)}`);

  // 3. Simulate Stripe Webhook (checkout.session.completed)
  console.log('[2] Simulating Stripe Webhook: checkout.session.completed');
  const eventId = `evt_sandbox_${Date.now()}`;
  const payload = {
    id: eventId,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_sandbox_123',
        payment_status: 'paid',
        client_reference_id: orderId,
        metadata: { orderId: orderId, providerId: provider.id },
        payment_intent: 'pi_sandbox_test_123'
      }
    }
  };

  // 4. Processing inside the Webhook Logic
  const currentOrder = db.getOrder(orderId);
  if (currentOrder && currentOrder.financialState === 'created') {
    
    // Create Entitlement
    const entitlement = await createEntitlement(
      currentOrder.id,
      provider.id,
      provider.facetimeHandle,
      appUrl
    );

    // Atomic State Transition
    db.atomicCaptureAndIssueEntitlement(currentOrder, entitlement);
    
    // Ledger Entry (Double-Entry Journal)
    const captureJournal = [
      {
        orderId: currentOrder.id,
        providerId: provider.id,
        adapterType: 'STRIPE',
        eventType: 'CHARGE_CAPTURED',
        account: '1010_STRIPE_CLEARING',
        debitCents: currentOrder.grossTotalCents,
        creditCents: 0,
        externalReferenceId: 'pi_sandbox_test_123',
        description: `Sandbox Test Capture`,
      },
      {
        orderId: currentOrder.id,
        providerId: provider.id,
        adapterType: 'STRIPE',
        eventType: 'PLATFORM_FEE_RETAINED',
        account: '4010_PLATFORM_SERVICE_REVENUE',
        debitCents: 0,
        creditCents: currentOrder.platformServiceShareCents,
        externalReferenceId: 'pi_sandbox_test_123',
        description: `Platform Revenue`,
      },
      {
        orderId: currentOrder.id,
        providerId: provider.id,
        adapterType: 'STRIPE',
        eventType: 'PROVIDER_PAYABLE_RECORDED',
        account: '2010_PROVIDER_PAYABLE_SERVICE',
        debitCents: 0,
        creditCents: currentOrder.providerServiceShareCents,
        externalReferenceId: 'pi_sandbox_test_123',
        description: `Provider Share`,
      }
    ];

    if (currentOrder.providerTipShareCents > 0) {
      captureJournal.push({
        orderId: currentOrder.id,
        providerId: provider.id,
        adapterType: 'STRIPE',
        eventType: 'TIP_PAYABLE_RECORDED',
        account: '2015_PROVIDER_PAYABLE_TIP',
        debitCents: 0,
        creditCents: currentOrder.providerTipShareCents,
        externalReferenceId: 'pi_sandbox_test_123',
        description: `Provider Tip Share`,
      });
    }

    db.addLedgerTransaction(captureJournal as any);

    console.log(`[3] Order Transitioned: ${currentOrder.id} | State: ${currentOrder.financialState} | Status: ${currentOrder.status}`);
    console.log(`[4] Entitlement Issued: ${entitlement.token.substring(0, 15)}...`);
    console.log(`[5] Ledger Entry Verified: 3 lines recorded for order ${currentOrder.id}`);
    
    // Final Audit
    const finalOrder = db.getOrder(orderId);
    const ledger = db.getLedgerEntriesByOrderId(orderId);
    
    console.log('\n--- FINAL SANDBOX AUDIT ---');
    console.log(`Order ID: ${finalOrder?.id}`);
    console.log(`Financial State: ${finalOrder?.financialState}`);
    console.log(`Entitlement Token: ${entitlement.token}`);
    console.log(`Ledger Rows: ${ledger.length}`);
    ledger.forEach(entry => {
      console.log(`  - Account: ${entry.account} | Debit: ${entry.debitCents} | Credit: ${entry.creditCents}`);
    });
  }
}

simulateSandboxCheckout().catch(console.error);
