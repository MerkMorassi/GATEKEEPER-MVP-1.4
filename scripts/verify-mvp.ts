import assert from 'assert';
import { createServer } from 'http';
import { db } from '../server/db.js';
import { Order, ProviderConfig } from '../src/types/index.js';
import express from 'express';
import { AddressInfo } from 'net';
import {
  calculateServiceAndTipBreakdown,
  calculateSettlement,
} from '../server/domain/money.js';
import { createEntitlement, generateOpaqueToken } from '../server/domain/access.js';
import {
  canTransitionOrder,
  canTransitionEntitlement,
  canTransitionFinancial,
  canTransitionSettlement,
  canTransitionSession,
} from '../server/domain/stateMachine.js';

async function runMVPVerificationSuite() {
  console.log('====================================================');
  console.log(' GATEKEEPER v1.3 — BLACK-BOX MVP VERIFICATION SUITE');
  console.log('====================================================\n');

  const app = express();
  app.use(express.json());

  // Mount routes matching production structure
  const { apiRouter } = await import('../server/routes/api.js');
  app.use('/api', apiRouter);

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://localhost:${port}/api`;

  let passed = 0;
  let failed = 0;

  const runTest = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
      console.log(`  ✓ PASS: ${name}`);
      passed++;
    } catch (err: any) {
      console.log(`  ✗ FAIL: ${name}`);
      console.error(err);
      failed++;
    }
  };

  const mockProvider: ProviderConfig = {
    id: 'prov_verify_mvp_v13',
    name: 'MVP Verification Master',
    email: 'mvp_verification@gatekeeper.io',
    payoutEmail: 'mvp_payouts@gatekeeper.io',
    facetimeHandle: 'facetime-mvp',
    active: true,
    payoutsEnabled: true,
    acceptedPaymentMethods: ['card', 'apple_pay', 'google_pay'],
    services: [
      {
        id: 'srv_trial',
        name: 'Free Trial Pass',
        description: 'Complimentary trial session',
        defaultDurationMinutes: 15,
        feeCents: 0,
        currency: 'USD',
        isTrial: true,
      },
      {
        id: 'srv_standard_50',
        name: 'Standard Consultation',
        description: 'Standard 30 minute consultation',
        defaultDurationMinutes: 30,
        feeCents: 5000,
        currency: 'USD',
      },
    ],
  };

  const originalProvider = db.getProvider();
  db.updateProvider(mockProvider);

  try {
    const provider = db.getProvider();
    const trialService = provider.services.find((s) => s.id === 'srv_trial')!;

    // TEST 1: PROVIDER CONFIGURATION BASELINE
    await runTest('1. PROVIDER CONFIGURATION BASELINE — Config & Service integrity', async () => {
      assert(provider.active, 'Provider must be active');
      assert.strictEqual(provider.id, 'prov_verify_mvp_v13');
      assert.strictEqual(trialService.feeCents, 0, 'Trial service price must be 0 cents');
      assert.strictEqual(trialService.defaultDurationMinutes, 15, 'Trial duration must be 15 minutes');
    });

    // TEST 2: 85/15 SETTLEMENT INVARIANTS & ZERO-CENT DRIFT
    await runTest('2. 85/15 SETTLEMENT INVARIANTS — Odd-cent rounding and zero-cent drift', async () => {
      // Test standard even split: $100.00 (10,000 cents)
      const breakdown100 = calculateServiceAndTipBreakdown(10000, 0);
      assert.strictEqual(breakdown100.grossTotalCents, 10000);
      assert.strictEqual(breakdown100.providerTotalShareCents, 8500);
      assert.strictEqual(breakdown100.platformTotalShareCents, 1500);
      assert.strictEqual(
        breakdown100.providerTotalShareCents + breakdown100.platformTotalShareCents,
        breakdown100.grossTotalCents,
        'Zero-cent drift invariant must hold'
      );

      // Test odd-cent split: $99.99 (9,999 cents)
      // 9999 * 0.85 = 8499.15 -> Math.floor = 8499
      // Platform = 9999 - 8499 = 1500
      const breakdown99 = calculateServiceAndTipBreakdown(9999, 0);
      assert.strictEqual(breakdown99.providerTotalShareCents, 8499);
      assert.strictEqual(breakdown99.platformTotalShareCents, 1500);
      assert.strictEqual(
        breakdown99.providerTotalShareCents + breakdown99.platformTotalShareCents,
        9999,
        'Zero-cent drift invariant must hold on odd amounts'
      );

      // Test tip preservation: $100 service + $25 tip
      const breakdownWithTip = calculateServiceAndTipBreakdown(10000, 2500);
      assert.strictEqual(breakdownWithTip.grossTotalCents, 12500);
      assert.strictEqual(breakdownWithTip.providerTipShareCents, 2500, 'Tips pass 100% to provider');
      assert.strictEqual(breakdownWithTip.platformTipShareCents, 0, 'Platform retains 0% of tip');
      assert.strictEqual(breakdownWithTip.providerTotalShareCents, 8500 + 2500);
      assert.strictEqual(breakdownWithTip.platformTotalShareCents, 1500);

      // Verify calculateSettlement constructs valid record
      const settlementRecord = calculateSettlement('test_ord_1', breakdownWithTip, 'USD');
      assert.strictEqual(settlementRecord.orderId, 'test_ord_1');
      assert.strictEqual(settlementRecord.grossCents, 12500);
      assert.strictEqual(settlementRecord.providerCents, 11000);
      assert.strictEqual(settlementRecord.agentCents, 1500);
      assert.strictEqual(settlementRecord.providerCents + settlementRecord.agentCents, 12500);
    });

    // TEST 3: NEGATIVE GROSS REJECTION
    await runTest('3. NEGATIVE GROSS REJECTION — Domain layer rejects invalid amounts', async () => {
      assert.throws(
        () => calculateServiceAndTipBreakdown(-100, 0),
        /violates minimum service fee requirement|negative/i,
        'Negative service amount must be rejected'
      );
      assert.throws(
        () => calculateServiceAndTipBreakdown(5000, -50),
        /negative/i,
        'Negative tip amount must throw an invariant error'
      );
    });

    // TEST 4: ORDER STATE-MACHINE INVARIANTS
    await runTest('4. ORDER STATE-MACHINE INVARIANTS — Enforces legal transition paths', async () => {
      // Legal transitions
      assert.strictEqual(canTransitionOrder('payment_pending', 'paid'), true);
      assert.strictEqual(canTransitionOrder('paid', 'confirmed'), true);
      assert.strictEqual(canTransitionOrder('confirmed', 'settled'), true);

      // Illegal transitions
      assert.strictEqual(canTransitionOrder('settled', 'payment_pending'), false);
      assert.strictEqual(canTransitionOrder('cancelled', 'paid'), false);
      assert.strictEqual(canTransitionOrder('paid', 'payment_pending'), false);
    });

    // TEST 5: ENTITLEMENT STATE-MACHINE INVARIANTS
    await runTest('5. ENTITLEMENT STATE-MACHINE INVARIANTS — Legal and illegal token transitions', async () => {
      // Legal entitlement transitions
      assert.strictEqual(canTransitionEntitlement('none', 'issued'), true);
      assert.strictEqual(canTransitionEntitlement('issued', 'active'), true);
      assert.strictEqual(canTransitionEntitlement('active', 'redeemed'), true);

      // Illegal entitlement transitions
      assert.strictEqual(canTransitionEntitlement('expired', 'active'), false);
      assert.strictEqual(canTransitionEntitlement('redeemed', 'issued'), false);
      assert.strictEqual(canTransitionEntitlement('none', 'active'), false);
    });

    // TEST 6: $0 FREE TRIAL PASS FLOW
    await runTest('6. FREE TRIAL PASS FLOW — Complete verify and entitlement issuance', async () => {
      const orderId = `gk_ord_trial_${Date.now()}`;
      const order: Order = {
        id: orderId,
        providerId: provider.id,
        serviceId: trialService.id,
        serviceName: trialService.name,
        amountCents: 0,
        currency: 'USD',
        status: 'payment_pending',
        isTrial: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        financialState: 'created',
        entitlementState: 'none',
        settlementState: 'unsettled',
        sessionState: 'idle',
        durationMinutes: 15,
        serviceCents: 0,
        tipCents: 0,
        grossTotalCents: 0,
        providerServiceShareCents: 0,
        platformServiceShareCents: 0,
        providerTipShareCents: 0,
        platformTipShareCents: 0,
        providerTotalShareCents: 0,
        platformTotalShareCents: 0,
        clientIp: '127.0.0.1',
      };
      db.saveOrder(order);

      const verifyRes = await fetch(`${baseUrl}/payments/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, paypalOrderId: 'FREE_TRIAL_PASS' }),
      });

      assert.strictEqual(verifyRes.status, 200, 'Verify endpoint should succeed for free trial');
      const verifyJson = await verifyRes.json();
      assert.strictEqual(verifyJson.success, true);
      assert(verifyJson.entitlement?.token, 'Must return entitlement token');

      const savedOrder = db.getOrder(orderId);
      assert(
        savedOrder?.status === 'paid' || savedOrder?.status === 'confirmed',
        'Order status should be paid or confirmed'
      );
      assert.strictEqual(savedOrder?.isTrial, true);

      const savedEntitlement = db.getEntitlementByOrderId(orderId);
      assert(savedEntitlement, 'Entitlement record must exist in DB');
      assert.strictEqual(savedEntitlement?.status, 'active');
    });

    // TEST 7: CONCURRENT VERIFY RACE SAFETY
    await runTest('7. CONCURRENT VERIFY RACE — Thread-safe atomic handling for free trial', async () => {
      const orderId = `gk_ord_concurrent_${Date.now()}`;
      const order: Order = {
        id: orderId,
        providerId: provider.id,
        serviceId: trialService.id,
        serviceName: trialService.name,
        amountCents: 0,
        currency: 'USD',
        status: 'payment_pending',
        isTrial: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        financialState: 'created',
        entitlementState: 'none',
        settlementState: 'unsettled',
        sessionState: 'idle',
        durationMinutes: 15,
        serviceCents: 0,
        tipCents: 0,
        grossTotalCents: 0,
        providerServiceShareCents: 0,
        platformServiceShareCents: 0,
        providerTipShareCents: 0,
        platformTipShareCents: 0,
        providerTotalShareCents: 0,
        platformTotalShareCents: 0,
        clientIp: '127.0.0.1',
      };
      db.saveOrder(order);

      const [res1, res2] = await Promise.all([
        fetch(`${baseUrl}/payments/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, paypalOrderId: 'FREE_TRIAL_PASS' }),
        }),
        fetch(`${baseUrl}/payments/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, paypalOrderId: 'FREE_TRIAL_PASS' }),
        }),
      ]);

      assert.strictEqual(res1.status, 200, 'First concurrent verify request should succeed');
      assert.strictEqual(res2.status, 200, 'Second concurrent verify request should succeed');

      const settlements = db.getAllSettlements().filter((s) => s.orderId === orderId);
      const entitlements = db.getAllEntitlements().filter((e) => e.orderId === orderId);
      assert.strictEqual(settlements.length, 1, 'Only one settlement should be written in DB');
      assert.strictEqual(entitlements.length, 1, 'Only one entitlement should be written in DB');
    });

    // TEST 8: SEQUENTIAL IDEMPOTENCY
    await runTest('8. SEQUENTIAL IDEMPOTENCY — Replay returns existing token and record', async () => {
      const orderId = `gk_ord_replay_${Date.now()}`;
      const order: Order = {
        id: orderId,
        providerId: provider.id,
        serviceId: trialService.id,
        serviceName: trialService.name,
        amountCents: 0,
        currency: 'USD',
        status: 'payment_pending',
        isTrial: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        financialState: 'created',
        entitlementState: 'none',
        settlementState: 'unsettled',
        sessionState: 'idle',
        durationMinutes: 15,
        serviceCents: 0,
        tipCents: 0,
        grossTotalCents: 0,
        providerServiceShareCents: 0,
        platformServiceShareCents: 0,
        providerTipShareCents: 0,
        platformTipShareCents: 0,
        providerTotalShareCents: 0,
        platformTotalShareCents: 0,
        clientIp: '127.0.0.1',
      };
      db.saveOrder(order);

      const verify1 = await fetch(`${baseUrl}/payments/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, paypalOrderId: 'FREE_TRIAL_PASS' }),
      });
      assert.strictEqual(verify1.status, 200);
      const json1 = await verify1.json();
      const firstToken = json1.entitlement?.token;
      assert(firstToken, 'First verification should return an entitlement token');

      // Sequential replay
      const verify2 = await fetch(`${baseUrl}/payments/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, paypalOrderId: 'FREE_TRIAL_PASS' }),
      });
      assert.strictEqual(verify2.status, 200);
      const json2 = await verify2.json();
      assert(
        json2.message?.includes('Idempotent'),
        'Should return confirmation message indicating idempotent response'
      );
      assert.strictEqual(
        json2.entitlement?.token,
        firstToken,
        'Subsequent verification should return the exact same token'
      );
    });

    // TEST 9: CLIENT-SUPPLIED AMOUNT TAMPERING IGNORED
    await runTest('9. FINANCIAL AUTHORITY — Rejects and ignores client amount tampering', async () => {
      const orderId = `gk_ord_authority_${Date.now()}`;
      const order: Order = {
        id: orderId,
        providerId: provider.id,
        serviceId: trialService.id,
        serviceName: trialService.name,
        amountCents: 0, // Authoritative DB: 0
        currency: 'USD',
        status: 'payment_pending',
        isTrial: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        financialState: 'created',
        entitlementState: 'none',
        settlementState: 'unsettled',
        sessionState: 'idle',
        durationMinutes: 15,
        serviceCents: 0,
        tipCents: 0,
        grossTotalCents: 0,
        providerServiceShareCents: 0,
        platformServiceShareCents: 0,
        providerTipShareCents: 0,
        platformTipShareCents: 0,
        providerTotalShareCents: 0,
        platformTotalShareCents: 0,
        clientIp: '127.0.0.1',
      };
      db.saveOrder(order);

      const verifyRes = await fetch(`${baseUrl}/payments/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          paypalOrderId: 'FREE_TRIAL_PASS',
          amountCents: 999999, // Tampering attempt
          grossCents: 123456,
        }),
      });

      assert.strictEqual(verifyRes.status, 200);
      const savedOrder = db.getOrder(orderId)!;
      assert.strictEqual(
        savedOrder.amountCents,
        0,
        'Database order amount must remain strictly unaltered at 0 cents'
      );

      const settlement = db.getSettlement(orderId)!;
      assert.strictEqual(
        settlement.grossCents,
        0,
        'Settlement gross cents must strictly match authoritative DB order (0 cents)'
      );
    });

    // TEST 10: EXPIRED TOKEN DETECTION & PRIVACY
    await runTest('10. EXPIRED TOKEN & PRIVACY — HTTP 410 with privacy-safe SupportContext', async () => {
      const expiredToken = `token_expired_${Date.now()}`;
      const orderId = `gk_ord_expired_${Date.now()}`;
      db.saveEntitlement({
        token: expiredToken,
        orderId,
        providerId: provider.id,
        facetimeDeliveryInstruction: provider.facetimeHandle,
        status: 'active',
        expiresAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 minutes ago
        createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        durationMinutes: 15,
        isTrial: true,
        serviceName: trialService.name,
      });

      const redeemRes = await fetch(`${baseUrl}/access/${expiredToken}/redeem`, {
        method: 'POST',
      });

      assert.strictEqual(redeemRes.status, 410, 'Expired token redemption must return HTTP 410 Gone');
      const redeemJson = await redeemRes.json();
      assert.strictEqual(redeemJson.success, false);
      const supportContext = redeemJson.supportContext;
      assert(supportContext, 'Expired token response must contain SupportContext');
      assert.strictEqual(
        supportContext.identityAccessRequired,
        false,
        'Privacy invariant: identityAccessRequired must be false'
      );
      assert.strictEqual(
        supportContext.refundAuthorized,
        false,
        'Privacy invariant: refundAuthorized must be false'
      );

      const payloadStr = JSON.stringify(supportContext);
      assert(!payloadStr.includes('client@'), 'Client email must not be leaked');
      assert(!payloadStr.includes('payerName'), 'Payer name must not be leaked');
    });

    // TEST 11: CONCURRENT TOKEN REDEMPTION RACE PROTECTION
    await runTest('11. CONCURRENT TOKEN REDEMPTION — Only one scan/redemption wins', async () => {
      const raceToken = `token_race_${Date.now()}`;
      const orderId = `gk_ord_race_${Date.now()}`;
      db.saveEntitlement({
        token: raceToken,
        orderId,
        providerId: provider.id,
        facetimeDeliveryInstruction: provider.facetimeHandle,
        status: 'active',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour future
        createdAt: new Date().toISOString(),
        durationMinutes: 15,
        isTrial: true,
        serviceName: trialService.name,
      });

      // Fire concurrent redemption requests
      const [res1, res2] = await Promise.all([
        fetch(`${baseUrl}/access/${raceToken}/redeem`, { method: 'POST' }),
        fetch(`${baseUrl}/access/${raceToken}/redeem`, { method: 'POST' }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      // Exactly one should succeed (200), the second should fail (409 Conflict or 400 Bad Request)
      assert.strictEqual(statuses[0], 200, 'One redemption must succeed with HTTP 200');
      assert(
        statuses[1] === 409 || statuses[1] === 400,
        `Duplicate redemption attempt must be rejected (got ${statuses[1]})`
      );

      const finalEntitlement = db.getEntitlement(raceToken)!;
      assert.strictEqual(finalEntitlement.status, 'redeemed', 'Entitlement status must be redeemed');
    });

    // TEST 12: UNAUTHENTICATED ADMIN ENDPOINT PROTECTION
    await runTest('12. UNAUTHENTICATED ADMIN ACCESS — Must fail closed without token/key', async () => {
      const endpoints = [
        '/admin/orders',
        '/admin/providers',
        '/admin/capabilities',
      ];

      for (const ep of endpoints) {
        const res = await fetch(`${baseUrl}${ep}`);
        assert(
          res.status === 401 || res.status === 403,
          `Endpoint ${ep} without auth must return 401 or 403 (got ${res.status})`
        );
      }
    });

    // TEST 13: BREAK-GLASS AUTHORIZATION PROTECTION
    await runTest('13. BREAK-GLASS AUTHORIZATION — Invalid token or unconfigured access rejected', async () => {
      const res = await fetch(`${baseUrl}/admin/break-glass`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'invalid_break_glass_token_123' }),
      });

      assert(
        res.status === 401 || res.status === 403 || res.status === 404,
        `Break-glass with invalid token must fail closed (got ${res.status})`
      );
    });
  } finally {
    db.updateProvider(originalProvider);
    server.close();
  }

  console.log('\n====================================================');
  console.log(` VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runMVPVerificationSuite().catch((err) => {
  console.error('Fatal verification failure:', err);
  process.exit(1);
});
