import { db } from '../server/db.js';

async function runCapabilitiesVerification() {
  console.log('===========================================================');
  console.log(' GATEKEEPER — PAYMENT CAPABILITY CONFIGURATION VERIFICATION');
  console.log('===========================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, description: string) {
    if (condition) {
      console.log(`  ✓ PASS: ${description}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${description}`);
      failed++;
    }
  }

  // Test 1: Retrieve default capabilities from DB
  const initialCaps = db.getPaymentCapabilities();
  assert(Boolean(initialCaps), 'Database returns initial PaymentCapabilitiesConfig');
  assert(Boolean(initialCaps.paymentMethods['card']), 'Payment method "card" exists in registry');
  assert(Boolean(initialCaps.paymentMethods['apple_pay']), 'Payment method "apple_pay" exists in registry');
  assert(Boolean(initialCaps.paymentMethods['google_pay']), 'Payment method "google_pay" exists in registry');
  assert(Boolean(initialCaps.paymentMethods['cash_app']), 'Payment method "cash_app" exists in registry');
  
  // Test 2: Payout providers registry
  assert(Boolean(initialCaps.payoutProviders['stripe_connect']), 'Payout provider "stripe_connect" exists in registry');
  assert(Boolean(initialCaps.payoutProviders['talentir']), 'Payout provider "talentir" exists in registry');
  
  // v1.4: Talentir should be operational by default in seeded DB
  assert(initialCaps.payoutProviders['talentir'].status === 'operational', 'Talentir status is "operational"');
  assert(initialCaps.payoutProviders['talentir'].enabled === true, 'Talentir is enabled');

  // Test 3: Admin toggle payment method (Cash App Pay)
  const toggledCashApp = db.togglePaymentMethodCapability('cash_app', true);
  assert(toggledCashApp.paymentMethods['cash_app'].enabled === true, 'Cash App Pay successfully enabled via DB toggle');
  
  const revertedCashApp = db.togglePaymentMethodCapability('cash_app', false);
  assert(revertedCashApp.paymentMethods['cash_app'].enabled === false, 'Cash App Pay successfully reverted to disabled');

  // Test 4: Talentir toggle (Now allowed in v1.4)
  console.log('\n--- v1.4 Talentir Toggle Verification ---');
  db.togglePayoutProviderCapability('talentir', false);
  const talentirDisabled = db.getPaymentCapabilities().payoutProviders['talentir'];
  assert(talentirDisabled.enabled === false && talentirDisabled.status === 'disabled', 'Talentir successfully disabled');
  
  db.togglePayoutProviderCapability('talentir', true);
  const talentirEnabled = db.getPaymentCapabilities().payoutProviders['talentir'];
  assert(talentirEnabled.enabled === true && talentirEnabled.status === 'operational', 'Talentir successfully re-enabled');

  console.log('-----------------------------------------------------------');
  console.log(`VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('===========================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runCapabilitiesVerification().catch((err) => {
  console.error('Fatal error in capabilities verification:', err);
  process.exit(1);
});
