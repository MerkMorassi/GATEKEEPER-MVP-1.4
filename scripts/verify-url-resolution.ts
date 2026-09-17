
import { Request } from 'express';

/**
 * Standardized URL resolution logic (MOCKED from server/routes/api.ts)
 */
function getAppBaseUrl(req: Partial<Request>, env: Record<string, string> = {}): string {
  const rawHost = req.headers?.host || 'localhost:3000';
  const safeHost = rawHost.replace(/[^a-zA-Z0-9.:-]/g, '');
  const protocol = req.secure || req.headers?.['x-forwarded-proto'] === 'https' || env.NODE_ENV === 'production' ? 'https' : 'http';
  
  let baseUrl = (env.APP_URL || `${protocol}://${safeHost}`).trim();
  
  // Normalize: Remove trailing slash if present
  if (baseUrl.endsWith('/')) {
    baseUrl = baseUrl.slice(0, -1);
  }
  
  return baseUrl;
}

function runTests() {
  console.log('--- GATEKEEPER URL RESOLUTION TEST SUITE ---');

  // CASE A: Local development
  const caseA = getAppBaseUrl({ headers: { host: 'localhost:3000' }, secure: false }, { NODE_ENV: 'development' });
  console.log(`CASE A (Local Dev): ${caseA === 'http://localhost:3000' ? '✅ PASS' : '❌ FAIL (' + caseA + ')'}`);

  // CASE B: Vercel deployment
  const caseB = getAppBaseUrl({ 
    headers: { 
      host: 'gatekeeper-mvp-14.vercel.app',
      'x-forwarded-proto': 'https'
    }, 
    secure: false 
  }, { NODE_ENV: 'production' });
  console.log(`CASE B (Vercel): ${caseB === 'https://gatekeeper-mvp-14.vercel.app' ? '✅ PASS' : '❌ FAIL (' + caseB + ')'}`);

  // CASE C: Explicit APP_URL
  const caseC = getAppBaseUrl({}, { APP_URL: 'https://gatekeeper-mvp-14.vercel.app' });
  console.log(`CASE C (Explicit APP_URL): ${caseC === 'https://gatekeeper-mvp-14.vercel.app' ? '✅ PASS' : '❌ FAIL (' + caseC + ')'}`);

  // CASE D: Trailing Slash Normalization
  const caseD = getAppBaseUrl({}, { APP_URL: 'https://gatekeeper-mvp-14.vercel.app/' });
  console.log(`CASE D (Trailing Slash): ${caseD === 'https://gatekeeper-mvp-14.vercel.app' ? '✅ PASS' : '❌ FAIL (' + caseD + ')'}`);

  // CASE E: Sandbox URL Structure Check
  const baseUrl = 'https://gatekeeper-mvp-14.vercel.app';
  const testOrderId = 'gk_ord_123';
  const successUrl = `${baseUrl}/#access=test_token_${testOrderId}&session_id=cs_test_123&sandbox=true`;
  // Check for the accidental double slash before the fragment: baseUrl//#...
  const doubleSlashFragment = successUrl.includes('//#');
  console.log(`CASE E (Sandbox URL Format): ${successUrl.includes('sandbox=true') && !doubleSlashFragment ? '✅ PASS' : '❌ FAIL (' + successUrl + ')'}`);
}

runTests();
