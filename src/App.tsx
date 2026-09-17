import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { ClientCheckout } from './components/ClientCheckout';
import { ClientSalesPage } from './components/ClientSalesPage';
import { ProviderDashboard } from './components/ProviderDashboard';
import { AgentAudit } from './components/AgentAudit';
import { AuthTerminal } from './components/AuthTerminal';
import { FlashPortal } from './components/FlashPortal';
import { AccessScanner } from './components/AccessScanner';
import { DeviceAuthModal } from './components/DeviceAuthModal';
import { apiFetch, setAuthToken } from './lib/api';

export default function App() {
  const [currentTab, setCurrentTab] = useState<'portal' | 'sales' | 'client' | 'provider' | 'agent' | 'scanner'>('portal');
  const [providerActive, setProviderActive] = useState(true);
  const [activeTokenFromHash, setActiveTokenFromHash] = useState<string | undefined>();
  const [activeGateFromHash, setActiveGateFromHash] = useState<string | undefined>();
  const [activeServiceFromHash, setActiveServiceFromHash] = useState<string | undefined>();
  const [checkoutOrderId, setCheckoutOrderId] = useState<string | undefined>();
  const [checkoutSessionId, setCheckoutSessionId] = useState<string | undefined>();
  const [checkoutStatus, setCheckoutStatus] = useState<'success' | 'cancel' | null>(null);
  const [role, setRole] = useState<'admin' | 'provider' | 'client' | 'guest' | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  // Device Auth state
  const [deviceAuthenticated, setDeviceAuthenticated] = useState<boolean>(true); // Default true until checked
  const [hasRegisteredDevices, setHasRegisteredDevices] = useState<boolean>(false);
  const [isDeviceLocked, setIsDeviceLocked] = useState<boolean>(false);

  // Check auth session & device auth on load
  useEffect(() => {
    apiFetch('/api/auth/session')
      .then((res) => res.json())
      .then((data) => {
        setHasRegisteredDevices(!!data.hasRegisteredDevices);
        const isProd = process.env.NODE_ENV === 'production';
        if (!data.authenticated && isProd) {
          setDeviceAuthenticated(false);
          setIsDeviceLocked(true);
        } else {
          setDeviceAuthenticated(data.authenticated || !isProd);
          setIsDeviceLocked(false);
        }

        if (data.role) {
          setRole(data.role);
        } else {
          const hash = window.location.hash;
          if (hash.startsWith('#access=') || hash.startsWith('#gate=') || hash.includes('checkout-success')) {
            setRole('guest');
          }
        }
      })
      .catch(console.error)
      .finally(() => setAuthLoading(false));
  }, []);

  // Detect URL Hash or Query access token, checkout return, or service payload on load
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash;
      const searchParams = new URLSearchParams(window.location.search);

      // 1. Check Query Params for checkout redirect
      const queryOrderId = searchParams.get('orderId') || searchParams.get('order_id');
      const querySessionId = searchParams.get('session_id') || searchParams.get('sessionId');
      const queryCheckout = searchParams.get('checkout');

      if (queryCheckout === 'success' || (queryOrderId && !hash.startsWith('#access='))) {
        setCheckoutOrderId(queryOrderId || undefined);
        setCheckoutSessionId(querySessionId || undefined);
        setCheckoutStatus(queryCheckout === 'cancel' ? 'cancel' : 'success');
        setCurrentTab('client');
        setRole(prev => (prev === 'admin' || prev === 'provider' || prev === 'client') ? prev : 'guest');
        return;
      }

      // 2. Check Hash Fragment routing
      if (hash.startsWith('#access=')) {
        const token = hash.replace('#access=', '');
        setActiveTokenFromHash(token);
        setActiveGateFromHash(undefined);
        setActiveServiceFromHash(undefined);
        setCheckoutOrderId(undefined);
        setCheckoutSessionId(undefined);
        setCheckoutStatus(null);
        setCurrentTab('client');
        setRole(prev => (prev === 'admin' || prev === 'provider' || prev === 'client') ? prev : 'guest');
      } else if (hash.startsWith('#gate=')) {
        const token = hash.replace('#gate=', '');
        setActiveGateFromHash(token);
        setActiveTokenFromHash(undefined);
        setActiveServiceFromHash(undefined);
        setCheckoutOrderId(undefined);
        setCheckoutSessionId(undefined);
        setCheckoutStatus(null);
        setCurrentTab('client');
        setRole(prev => (prev === 'admin' || prev === 'provider' || prev === 'client') ? prev : 'guest');
      } else if (hash.startsWith('#service=')) {
        const serviceId = hash.replace('#service=', '');
        setActiveServiceFromHash(serviceId);
        setActiveGateFromHash(undefined);
        setActiveTokenFromHash(undefined);
        setCheckoutOrderId(undefined);
        setCheckoutSessionId(undefined);
        setCheckoutStatus(null);
        setCurrentTab('client');
      } else if (hash.includes('checkout-success') || hash.includes('checkout_success')) {
        const cleanHash = hash.replace(/^#/, '');
        const orderIdMatch = cleanHash.match(/orderId=([^&]+)/) || cleanHash.match(/order_id=([^&]+)/);
        const sessionIdMatch = cleanHash.match(/sessionId=([^&]+)/) || cleanHash.match(/session_id=([^&]+)/);

        setCheckoutOrderId(orderIdMatch ? orderIdMatch[1] : undefined);
        setCheckoutSessionId(sessionIdMatch ? sessionIdMatch[1] : undefined);
        setCheckoutStatus('success');
        setActiveGateFromHash(undefined);
        setActiveTokenFromHash(undefined);
        setActiveServiceFromHash(undefined);
        setCurrentTab('client');
        setRole(prev => (prev === 'admin' || prev === 'provider' || prev === 'client') ? prev : 'guest');
      } else if (hash.includes('checkout-cancel') || hash.includes('checkout_cancel') || hash.startsWith('#cancel')) {
        const cleanHash = hash.replace(/^#/, '');
        const orderIdMatch = cleanHash.match(/orderId=([^&]+)/);
        setCheckoutOrderId(orderIdMatch ? orderIdMatch[1] : undefined);
        setCheckoutStatus('cancel');
        setActiveGateFromHash(undefined);
        setActiveTokenFromHash(undefined);
        setActiveServiceFromHash(undefined);
        setCurrentTab('client');
      } else if (hash.startsWith('#sales') || hash.startsWith('#@') || hash.startsWith('#landing')) {
        setCurrentTab('sales');
      } else if (hash.startsWith('#provider')) {
        setCurrentTab('provider');
      } else if (hash.startsWith('#admin')) {
        setCurrentTab('agent');
      }
    };

    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  // Update Document Title based on tab
  useEffect(() => {
    const tabTitles: Record<string, string> = {
      portal: 'GateKeeper | Access Portal',
      sales: 'GateKeeper | Strategic Advisory & Offerings',
      client: 'GateKeeper | Client Access & Verification',
      provider: 'GateKeeper | Provider Operations Console',
      agent: 'GateKeeper | Admin Control Center',
      scanner: 'GateKeeper | Gate Pass Verification',
    };
    document.title = tabTitles[currentTab] || 'GateKeeper | Secure Communications & Delivery';
  }, [currentTab]);

  // Fetch initial Provider status for the badge in header
  useEffect(() => {
    fetch('/api/config')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.provider) {
          setProviderActive(data.provider.active);
        }
      })
      .catch((err) => console.error('Error fetching config status:', err));
  }, [currentTab]);

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    setAuthToken(null);
    setRole(null);
    setCurrentTab('portal');
  };

  // 15-Minute Inactivity Idle Timer: Automatically logs out inactive authenticated users
  useEffect(() => {
    // Only monitor inactivity when an authenticated user session is active
    if (!role || role === 'guest') return;

    const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes in milliseconds
    let lastActivity = Date.now();
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let throttleTimeout: ReturnType<typeof setTimeout> | null = null;

    const triggerAutoLogout = async () => {
      console.warn('[Session Security] Inactive for more than 15 minutes. Automatically logging out.');
      try {
        await handleLogout();
      } catch (err) {
        console.error('Error during automatic idle logout:', err);
      }
    };

    const scheduleTimer = () => {
      if (timerId) clearTimeout(timerId);
      const elapsed = Date.now() - lastActivity;
      const remaining = Math.max(0, IDLE_TIMEOUT_MS - elapsed);
      timerId = setTimeout(() => {
        if (Date.now() - lastActivity >= IDLE_TIMEOUT_MS) {
          triggerAutoLogout();
        } else {
          scheduleTimer();
        }
      }, remaining);
    };

    const onUserActivity = () => {
      lastActivity = Date.now();
      if (!throttleTimeout) {
        throttleTimeout = setTimeout(() => {
          throttleTimeout = null;
        }, 1000); // 1-second throttle for activity event listeners
        scheduleTimer();
      }
    };

    const onVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        if (Date.now() - lastActivity >= IDLE_TIMEOUT_MS) {
          triggerAutoLogout();
        } else {
          scheduleTimer();
        }
      }
    };

    const monitoredEvents = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'wheel'];

    monitoredEvents.forEach((eventType) => {
      window.addEventListener(eventType, onUserActivity, { passive: true });
    });
    window.addEventListener('visibilitychange', onVisibilityOrFocus);
    window.addEventListener('focus', onVisibilityOrFocus);

    // Initialize timer
    scheduleTimer();

    return () => {
      if (timerId) clearTimeout(timerId);
      if (throttleTimeout) clearTimeout(throttleTimeout);
      monitoredEvents.forEach((eventType) => {
        window.removeEventListener(eventType, onUserActivity);
      });
      window.removeEventListener('visibilitychange', onVisibilityOrFocus);
      window.removeEventListener('focus', onVisibilityOrFocus);
    };
  }, [role]);

  const handlePortalNavigate = (targetTab: 'client' | 'provider' | 'agent', targetRole?: 'admin' | 'provider' | 'client' | 'guest' | null) => {
    if (targetRole !== undefined) {
      setRole(targetRole);
    }
    setCurrentTab(targetTab);
  };

  return (
    <div className="min-h-screen bg-primary-a10 text-theme-light flex flex-col font-sans selection:bg-info-a0 selection:text-primary-a0">
      {/* Device Lock Screen Modal */}
      {isDeviceLocked && (
        <DeviceAuthModal
          hasRegisteredDevices={hasRegisteredDevices}
          onAuthenticated={() => {
            setDeviceAuthenticated(true);
            setIsDeviceLocked(false);
            setHasRegisteredDevices(true);
          }}
        />
      )}

      {/* Top Bar Header */}
      <Header
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        providerActive={providerActive}
        role={role}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <main className="flex-1">
        {currentTab === 'portal' && (
          <FlashPortal currentRole={role} onNavigate={handlePortalNavigate} />
        )}

        {currentTab === 'sales' && (
          <ClientSalesPage onNavigateToCheckout={() => setCurrentTab('client')} />
        )}

        {currentTab === 'client' && (
          <ClientCheckout
            activeTokenFromHash={activeTokenFromHash}
            activeGateFromHash={activeGateFromHash}
            activeServiceFromHash={activeServiceFromHash}
            checkoutOrderId={checkoutOrderId}
            checkoutSessionId={checkoutSessionId}
            checkoutStatus={checkoutStatus}
          />
        )}
        
        {currentTab === 'provider' && (
          authLoading ? <div className="p-8 text-center text-surface-a40 font-mono">Checking security clearance...</div> :
          role === 'provider' ? <ProviderDashboard /> : 
          <AuthTerminal onAuthenticated={(newRole) => { setRole(newRole); }} />
        )}
        
        {currentTab === 'agent' && (
          authLoading ? <div className="p-8 text-center text-surface-a40 font-mono">Checking security clearance...</div> :
          role === 'admin' ? <AgentAudit /> : 
          <AuthTerminal onAuthenticated={(newRole) => { setRole(newRole); }} />
        )}
        
        {currentTab === 'scanner' && <AccessScanner />}
      </main>

      {/* Footer */}
      <footer className="border-t border-surface-a10 bg-tonal-a0/90 py-6 text-center text-surface-a40 text-xs font-mono">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="sm:w-1/3 sm:text-left">
            <span>ALL SIGNAL. NO NOISE.</span>
          </div>
          <div className="sm:w-1/3 text-center font-medium text-theme-light/80">
            <span>GATEKEEPER © 2026 Merk Morassi, LLC</span>
          </div>
          <div className="sm:w-1/3 sm:text-right">
            <span>You do your thing. We do ours.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
