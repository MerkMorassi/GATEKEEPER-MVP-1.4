/**
 * GateKeeper v1.4 - Stripe Configuration Save & Readback Lifecycle Integration Test Suite
 * 
 * Validates the complete lifecycle:
 * 1. Valid and invalid API credential submission and live/format validation
 * 2. Webhook signing secret cryptographic HMAC verification
 * 3. Cross-mode contamination protection (Test vs Live)
 * 4. Application Base URL (APP_URL) source tracking and normalization
 * 5. Direct database persistence vs in-memory fallback
 * 6. Authoritative server readback verification (preventing optimistic UI states)
 * 7. Frontend refresh simulation (idempotent multi-request readback)
 * 8. Zero-leakage secret masking invariants
 */

import express from 'express';
import http from 'http';
import cookieParser from 'cookie-parser';
import { db } from '../server/db.js';
import { apiRouter } from '../server/routes/api.js';
import { StripeConfigResponse } from '../src/types/index.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, description: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${description}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${description}`);
    failed++;
  }
}

async function runTestSuite() {
  console.log('================================================================');
  console.log(' STRIPE CONFIGURATION SAVE & READBACK LIFECYCLE TEST SUITE');
  console.log('================================================================\n');

  const ADMIN_KEY = process.env.ADMIN_SECRET_KEY || 'gk_admin_secret_dev_2026';

  // 1. Setup Express Test Server with raw body and cookie parsing
  const app = express();
  app.use(cookieParser());
  app.use(express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    }
  }));
  app.use('/api', apiRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  const adminHeaders = {
    'Content-Type': 'application/json',
    'x-admin-key': ADMIN_KEY,
  };

  try {
    // -------------------------------------------------------------------------
    // TEST SECTION 1: Initial Readback & Authorization Verification
    // -------------------------------------------------------------------------
    console.log('--- TEST SECTION 1: Security & Initial Readback ---');
    
    // 1.1: Unauthenticated request to /api/admin/stripe must be rejected
    const unauthRes = await fetch(`${baseUrl}/admin/stripe`);
    assert(unauthRes.status === 401, 'Unauthenticated GET /api/admin/stripe is rejected with HTTP 401');

    // 1.2: Authenticated request returns valid configuration envelope
    const initialGetRes = await fetch(`${baseUrl}/admin/stripe`, { headers: adminHeaders });
    assert(initialGetRes.status === 200, 'Authenticated GET /api/admin/stripe returns HTTP 200');
    const initialJson = await initialGetRes.json();
    assert(initialJson.success === true, 'Response contains success: true');
    assert(typeof initialJson.stripeConfig === 'object', 'Response contains stripeConfig object');

    // -------------------------------------------------------------------------
    // TEST SECTION 2: Webhook Signing Secret Cryptographic HMAC Verification
    // -------------------------------------------------------------------------
    console.log('\n--- TEST SECTION 2: Webhook Signing Secret Validation & Cryptographic HMAC ---');

    // 2.1: Invalid prefix rejected
    const badWhRes1 = await fetch(`${baseUrl}/admin/stripe`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({
        webhookSecret: 'invalid_secret_without_whsec_prefix',
      }),
    });
    assert(badWhRes1.status === 400, 'Webhook secret lacking whsec_ prefix rejected with HTTP 400');
    const badWhJson1 = await badWhRes1.json();
    assert(badWhJson1.error.includes('Must start with whsec_'), 'Rejection error explains prefix requirement');

    // 2.2: Too short webhook secret rejected (<10 chars)
    const badWhRes2 = await fetch(`${baseUrl}/admin/stripe`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({
        webhookSecret: 'whsec_1',
      }),
    });
    assert(badWhRes2.status === 400, 'Short webhook secret (<10 chars) rejected with HTTP 400');

    // 2.3: Valid webhook secret passes cryptographic HMAC test & persists
    const VALID_TEST_WHSEC = 'whsec_test_valid_cryptographic_signing_secret_998877';
    const validWhRes = await fetch(`${baseUrl}/admin/stripe`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({
        webhookSecret: VALID_TEST_WHSEC,
      }),
    });
    assert(validWhRes.status === 200, 'Valid webhook secret passes cryptographic HMAC test (HTTP 200)');
    const validWhJson = await validWhRes.json();
    assert(validWhJson.stripeConfig.webhookSecretConfigured === true, 'Webhook secret marked configured');
    assert(validWhJson.stripeConfig.verifiedWebhookSecret === true, 'Webhook secret marked verified');

    // 2.4: Immediate Authoritative Readback confirms verifiedWebhookSecret is true
    const readbackWhRes = await fetch(`${baseUrl}/admin/stripe`, { headers: adminHeaders });
    const readbackWhJson = await readbackWhRes.json();
    assert(readbackWhJson.stripeConfig.verifiedWebhookSecret === true, 'Server readback confirms verifiedWebhookSecret: true');
    assert(readbackWhJson.stripeConfig.webhookSecretConfigured === true, 'Server readback confirms webhookSecretConfigured: true');

    // -------------------------------------------------------------------------
    // TEST SECTION 3: Publishable Key & Secret Key Format / Cross-Mode Protection
    // -------------------------------------------------------------------------
    console.log('\n--- TEST SECTION 3: Key Validation & Cross-Mode Contamination Protection ---');

    // 3.1: Invalid Publishable Key format rejected
    const badPkRes = await fetch(`${baseUrl}/admin/stripe`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({
        publishableKey: 'not_a_valid_stripe_publishable_key',
      }),
    });
    assert(badPkRes.status === 400, 'Invalid publishable key format rejected with HTTP 400');

    // 3.2: Live Publishable Key rejected in Test Mode
    const livePkInTestRes = await fetch(`${baseUrl}/admin/stripe`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({
        environment: 'test',
        publishableKey: 'pk_live_1234567890abcdef',
      }),
    });
    assert(livePkInTestRes.status === 400, 'Live Publishable Key rejected in Test Mode');

    // 3.3: Live Secret Key rejected in Test Mode
    const liveSkInTestRes = await fetch(`${baseUrl}/admin/stripe`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({
        environment: 'test',
        secretKey: 'sk_live_1234567890abcdef',
      }),
    });
    assert(liveSkInTestRes.status === 400, 'Live Secret Key rejected in Test Mode');

    // 3.4: Test Secret Key rejected in Live Mode
    const testSkInLiveRes = await fetch(`${baseUrl}/admin/stripe`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({
        environment: 'live',
        enableLiveConfirmed: true,
        secretKey: 'sk_test_1234567890abcdef',
      }),
    });
    assert(testSkInLiveRes.status === 400, 'Test Secret Key rejected in Live Mode');

    // 3.5: Switching to Live Mode without explicit confirmation is rejected
    const liveWithoutConfirmRes = await fetch(`${baseUrl}/admin/stripe`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({
        environment: 'live',
      }),
    });
    assert(liveWithoutConfirmRes.status === 400, 'Switching to Live Mode without enableLiveConfirmed rejected');

    // 3.6: Valid Publishable Key in Test Mode accepted & masked in readback
    const VALID_TEST_PK = 'pk_test_51MockedStripePublishableKeyForTesting1234567890';
    const validPkRes = await fetch(`${baseUrl}/admin/stripe`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({
        publishableKey: VALID_TEST_PK,
      }),
    });
    assert(validPkRes.status === 200, 'Valid Publishable Key saved successfully');
    const validPkJson = await validPkRes.json();
    assert(validPkJson.stripeConfig.publishableKey.startsWith('pk_test_'), 'Publishable key returned in masked format');
    assert(validPkJson.stripeConfig.publishableKey.includes('••••'), 'Publishable key is securely masked with bullets in response');

    // -------------------------------------------------------------------------
    // TEST SECTION 4: Application Base URL (APP_URL) Lifecycle & Normalization
    // -------------------------------------------------------------------------
    console.log('\n--- TEST SECTION 4: Application Base URL Lifecycle & Source Attribution ---');

    // 4.1: Custom Admin-managed App URL save & trailing slash removal
    const customUrlWithSlash = 'https://portal.mycompany-payments.io/';
    const urlRes1 = await fetch(`${baseUrl}/admin/stripe`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({
        appUrl: customUrlWithSlash,
      }),
    });
    assert(urlRes1.status === 200, 'Custom APP_URL accepted (HTTP 200)');
    const urlJson1 = await urlRes1.json();
    assert(urlJson1.stripeConfig.appUrl === 'https://portal.mycompany-payments.io', 'Trailing slash normalized and removed');
    assert(urlJson1.stripeConfig.appUrlSource === 'database', 'Source attributed to database');
    assert(urlJson1.stripeConfig.verifiedAppUrl === true, 'verifiedAppUrl is true for valid URL');

    // 4.2: Invalid URL scheme rejected
    const badUrlRes = await fetch(`${baseUrl}/admin/stripe`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({
        appUrl: 'ftp://invalid-protocol.example.com',
      }),
    });
    assert(badUrlRes.status === 400, 'Non-HTTP/HTTPS protocol rejected');

    // 4.3: Resetting App URL falls back to request host / environment
    const resetUrlRes = await fetch(`${baseUrl}/admin/stripe`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({
        appUrl: '',
      }),
    });
    assert(resetUrlRes.status === 200, 'Resetting custom APP_URL accepted');
    const resetUrlJson = await resetUrlRes.json();
    assert(resetUrlJson.stripeConfig.appUrlSource === 'request_host' || resetUrlJson.stripeConfig.appUrlSource === 'env', 'Fallback source properly resolved');

    // -------------------------------------------------------------------------
    // TEST SECTION 5: Frontend Page Refresh Simulation (Multi-Client Determinism)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST SECTION 5: Frontend Page Refresh Simulation ---');

    // Set up a verified webhook secret and publishable key for state check
    await fetch(`${baseUrl}/admin/stripe`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({
        publishableKey: 'pk_test_sample_refresh_check_123',
        webhookSecret: 'whsec_sample_refresh_check_signature_key_456',
        appUrl: 'https://gatekeeper.test-domain.app',
      }),
    });

    // Simulate 5 independent subsequent client requests (like 5 page refreshes)
    let allRefreshesConsistent = true;
    for (let i = 1; i <= 5; i++) {
      const refreshRes = await fetch(`${baseUrl}/admin/stripe`, { headers: adminHeaders });
      if (!refreshRes.ok) {
        allRefreshesConsistent = false;
        break;
      }
      const refreshData = (await refreshRes.json()).stripeConfig as StripeConfigResponse;

      const check1 = refreshData.webhookSecretConfigured === true;
      const check2 = refreshData.verifiedWebhookSecret === true;
      const check3 = refreshData.verifiedAppUrl === true;
      const check4 = refreshData.appUrl === 'https://gatekeeper.test-domain.app';
      const check5 = refreshData.appUrlSource === 'database';
      const check6 = typeof refreshData.persisted === 'boolean';

      if (!check1 || !check2 || !check3 || !check4 || !check5 || !check6) {
        allRefreshesConsistent = false;
        console.error(`Inconsistency found on refresh #${i}:`, refreshData);
        break;
      }
    }
    assert(allRefreshesConsistent, '5 consecutive page refreshes returned identical, verified server state');

    // -------------------------------------------------------------------------
    // TEST SECTION 6: Unverified / Inactive State Invariants
    // -------------------------------------------------------------------------
    console.log('\n--- TEST SECTION 6: Unverified / Failure State Invariants ---');

    // 6.1: When Secret Key is unverified/absent, configured and connected must be FALSE
    const savedEnvSk = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    db.updateStripeConfig({ secretKey: '', verifiedSecretKey: false, connected: false });
    const unverifiedStateRes = await fetch(`${baseUrl}/admin/stripe`, { headers: adminHeaders });
    const unverifiedData = (await unverifiedStateRes.json()).stripeConfig as StripeConfigResponse;

    assert(unverifiedData.configured === false, 'configured is false when secret key is not verified');
    assert(unverifiedData.connected === false, 'connected is false when secret key is not verified');
    assert(unverifiedData.verifiedSecretKey === false, 'verifiedSecretKey is false');
    if (savedEnvSk) process.env.STRIPE_SECRET_KEY = savedEnvSk;

    // 6.2: When Webhook Secret is cleared and no env var exists, verifiedWebhookSecret & webhookSecretConfigured must be FALSE
    const savedEnvWh = process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    db.updateStripeConfig({ webhookSecret: '', verifiedWebhookSecret: false });
    const clearedWhRes = await fetch(`${baseUrl}/admin/stripe`, { headers: adminHeaders });
    const clearedWhData = (await clearedWhRes.json()).stripeConfig as StripeConfigResponse;

    assert(clearedWhData.webhookSecretConfigured === false, 'webhookSecretConfigured is false when empty in db and env');
    assert(clearedWhData.verifiedWebhookSecret === false, 'verifiedWebhookSecret is false when empty');
    if (savedEnvWh) process.env.STRIPE_WEBHOOK_SECRET = savedEnvWh;

    // -------------------------------------------------------------------------
    // TEST SECTION 7: Zero Raw Secret Leakage Invariant
    // -------------------------------------------------------------------------
    console.log('\n--- TEST SECTION 7: Zero Raw Secret Leakage Invariant ---');

    // Save test secrets into DB directly to verify masking on all read paths
    const SENSITIVE_SK = 'sk_test_secret_raw_key_do_not_leak_987654321';
    const SENSITIVE_WH = 'whsec_raw_webhook_secret_do_not_leak_987654321';
    db.updateStripeConfig({
      secretKey: SENSITIVE_SK,
      webhookSecret: SENSITIVE_WH,
      verifiedSecretKey: true,
      verifiedWebhookSecret: true,
    });

    const leakCheckRes = await fetch(`${baseUrl}/admin/stripe`, { headers: adminHeaders });
    const rawText = await leakCheckRes.text();

    assert(!rawText.includes(SENSITIVE_SK), 'Raw Secret Key is NEVER present in GET /api/admin/stripe response');
    assert(!rawText.includes(SENSITIVE_WH), 'Raw Webhook Secret is NEVER present in GET /api/admin/stripe response');
    assert(rawText.includes('secretKeyConfigured'), 'Payload indicates secretKeyConfigured as boolean');
    assert(rawText.includes('webhookSecretConfigured'), 'Payload indicates webhookSecretConfigured as boolean');

  } finally {
    server.close();
  }

  // Summary
  console.log('\n================================================================');
  console.log(` STRIPE CONFIGURATION LIFECYCLE TESTS COMPLETE`);
  console.log(` Total Passed: ${passed} | Total Failed: ${failed}`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Test suite failed with uncaught exception:', err);
  process.exit(1);
});
