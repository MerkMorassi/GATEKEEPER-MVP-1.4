import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  TrendingUp,
  ShieldCheck,
  FileText,
  AlertTriangle,
  RefreshCw,
  KeyRound,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  Users,
  ExternalLink,
  CreditCard,
  Webhook,
  LayoutDashboard,
  Sliders,
  Activity,
  Timer,
} from 'lucide-react';
import { SystemOverview, Order, Settlement, Payout, AuditEvent, EscrowSession } from '../types';
import { apiFetch } from '../lib/api';
import { EscrowModal } from './EscrowModal';
import { AdminStripeControl } from './AdminStripeControl';
import { AdminCapabilitiesControl } from './AdminCapabilitiesControl';
import { AdminProvidersControl } from './AdminProvidersControl';
import { AdminOrdersControl } from './AdminOrdersControl';
import { AdminLedgerControl } from './AdminLedgerControl';
import { AdminWebhooksControl } from './AdminWebhooksControl';
import { AdminUsersControl } from './AdminUsersControl';
import { AdminApiControl } from './AdminApiControl';
import { AdminSecurityControl } from './AdminSecurityControl';
import { SessionTrendsChart } from './SessionTrendsChart';
import { AdminIdleTimeoutSetting } from './AdminIdleTimeoutSetting';
import { AdminAbnormalSessionSetting } from './AdminAbnormalSessionSetting';
import { DashboardSkeleton } from './Skeleton';
import { sessionConfig, isAbnormalSessionDuration } from '../lib/sessionConfig';

export const AgentAudit: React.FC = () => {
  const [data, setData] = useState<SystemOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Escrow modal state
  const [selectedOrderIdForEscrow, setSelectedOrderIdForEscrow] = useState<string | null>(null);
  const [activeEscrowSessions, setActiveEscrowSessions] = useState<EscrowSession[]>([]);

  // Async action feedback states
  const [resolvingOrderId, setResolvingOrderId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Filter for audit events
  const [auditFilter, setAuditFilter] = useState<string>('ALL');

  // Pagination states for Dashboard collections
  const [manualReviewPage, setManualReviewPage] = useState<number>(1);
  const [settlementsPage, setSettlementsPage] = useState<number>(1);
  const [payoutsPage, setPayoutsPage] = useState<number>(1);
  const [auditEventsPage, setAuditEventsPage] = useState<number>(1);

  // Admin Sub-Navigation tab selection
  const [adminSubTab, setAdminSubTab] = useState<'dashboard' | 'users' | 'providers' | 'orders' | 'ledger' | 'webhooks' | 'stripe' | 'capabilities' | 'api' | 'security'>('dashboard');

  // Deep linking and browser refresh hash sync
  useEffect(() => {
    const handleHashSync = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#admin/')) {
        const sub = hash.replace('#admin/', '').trim();
        if (['dashboard', 'users', 'providers', 'orders', 'ledger', 'webhooks', 'stripe', 'capabilities', 'api', 'security'].includes(sub)) {
          setAdminSubTab(sub as any);
        }
      }
    };

    handleHashSync();
    window.addEventListener('hashchange', handleHashSync);
    return () => window.removeEventListener('hashchange', handleHashSync);
  }, []);

  const handleSubTabChange = (tabId: 'dashboard' | 'users' | 'providers' | 'orders' | 'ledger' | 'webhooks' | 'stripe' | 'capabilities' | 'api' | 'security') => {
    setAdminSubTab(tabId);
    window.location.hash = `#admin/${tabId}`;
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  const fetchOverview = async (overrideParams?: {
    manualReviewPage?: number;
    settlementsPage?: number;
    payoutsPage?: number;
    auditEventsPage?: number;
    auditFilter?: string;
  }) => {
    const mrPage = overrideParams?.manualReviewPage ?? manualReviewPage;
    const sPage = overrideParams?.settlementsPage ?? settlementsPage;
    const pPage = overrideParams?.payoutsPage ?? payoutsPage;
    const aPage = overrideParams?.auditEventsPage ?? auditEventsPage;
    const aFilter = overrideParams?.auditFilter ?? auditFilter;

    try {
      setLoading(true);
      const params = new URLSearchParams({
        manualReviewPage: String(mrPage),
        settlementsPage: String(sPage),
        payoutsPage: String(pPage),
        auditEventsPage: String(aPage),
        auditFilter: aFilter,
        limit: '10',
      });
      const res = await apiFetch(`/api/admin/overview?${params.toString()}`);
      const json = await res.json();
      if (json.success && json.overview) {
        setData(json.overview);
        if (json.overview.manualReviewPagination) {
          setManualReviewPage(json.overview.manualReviewPagination.page);
        }
        if (json.overview.settlementsPagination) {
          setSettlementsPage(json.overview.settlementsPagination.page);
        }
        if (json.overview.payoutsPagination) {
          setPayoutsPage(json.overview.payoutsPagination.page);
        }
        if (json.overview.auditEventsPagination) {
          setAuditEventsPage(json.overview.auditEventsPagination.page);
        }
      } else {
        setError(json.error || 'Failed to load system audit data');
      }
    } catch (err: any) {
      setError('Network error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleManualReviewPageChange = (newPage: number) => {
    setManualReviewPage(newPage);
    fetchOverview({ manualReviewPage: newPage });
  };

  const handleSettlementsPageChange = (newPage: number) => {
    setSettlementsPage(newPage);
    fetchOverview({ settlementsPage: newPage });
  };

  const handlePayoutsPageChange = (newPage: number) => {
    setPayoutsPage(newPage);
    fetchOverview({ payoutsPage: newPage });
  };

  const handleAuditEventsPageChange = (newPage: number) => {
    setAuditEventsPage(newPage);
    fetchOverview({ auditEventsPage: newPage });
  };

  const handleAuditFilterChange = (newFilter: string) => {
    setAuditFilter(newFilter);
    setAuditEventsPage(1);
    fetchOverview({ auditFilter: newFilter, auditEventsPage: 1 });
  };

  const handleManualResolve = async (orderId: string, resolution: 'settle' | 'void') => {
    setResolvingOrderId(orderId);
    try {
      const res = await apiFetch('/api/admin/manual-review/resolve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId,
          resolution,
          operator: 'agent_admin',
          reason: `Agent resolved order as ${resolution}`,
        }),
      });
      const result = await res.json();
      if (result.success) {
        setActionNotice(`Order ${orderId} successfully ${resolution === 'settle' ? 'settled' : 'voided'} ✓`);
        setTimeout(() => setActionNotice(null), 3500);
        fetchOverview();
      }
    } catch (err) {
      console.error('Error resolving manual review order:', err);
    } finally {
      setResolvingOrderId(null);
    }
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (!data) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 text-surface-a40">
        <p className="text-sm font-mono text-danger-a0 mb-2">Access Denied</p>
        <p className="text-xs font-mono max-w-md text-center">{error || 'You do not have permission to view this console. Ensure you are logged in as the Agent Admin.'}</p>
      </div>
    );
  }

  const filteredAuditEvents = auditFilter === 'ALL'
    ? data.auditEvents
    : data.auditEvents.filter((e) => e.eventType === auditFilter);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      {/* Title Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-surface-a10 gap-4">
        <div>
          <span className="text-[11px] font-mono uppercase tracking-widest text-info-a0 font-semibold bg-info-a0/10 px-2.5 py-1 rounded-md border border-info-a0/20">
            Merk Morassi and LLC • Agency Operator
          </span>
          <h1 className="text-2xl font-bold text-theme-light mt-2">Financial & Audit Control Surface</h1>
          <p className="text-xs text-surface-a40 mt-0.5 font-mono">
            Authoritative 85/15 Settlement • Provider Payout Ledger • Stripe Integration • Break-Glass Escrow
          </p>
        </div>

        <button
          onClick={fetchOverview}
          className="px-4 py-2 bg-tonal-a0 hover:bg-surface-a10 text-theme-light text-xs font-mono rounded-xl border border-surface-a10 transition-all flex items-center space-x-2 self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Audit Trail</span>
        </button>
      </div>

      {/* Admin Sub-Navigation Menu */}
      <div className="flex items-center space-x-2 border-b border-surface-a10 pb-4 overflow-x-auto no-scrollbar">
        {[
          { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
          { id: 'users', label: 'Users', icon: Users },
          { id: 'providers', label: 'Providers', icon: User },
          { id: 'orders', label: 'Orders', icon: FileText },
          { id: 'ledger', label: 'Ledger', icon: DollarSign },
          { id: 'webhooks', label: 'Webhooks', icon: Webhook },
          { id: 'api', label: 'API Keys & SDK', icon: KeyRound },
          { id: 'stripe', label: 'Stripe', icon: CreditCard },
          { id: 'capabilities', label: 'Capabilities', icon: Sliders },
          { id: 'security', label: 'Security & Sessions', icon: ShieldCheck },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = adminSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleSubTabChange(tab.id as any)}
              className={`px-3.5 py-2 rounded-xl text-xs font-mono font-medium transition-all flex items-center space-x-2 whitespace-nowrap ${
                isActive
                  ? 'bg-info-a0/20 text-info-a0 border border-info-a0/40 font-bold shadow-sm'
                  : 'bg-tonal-a0 text-surface-a40 hover:text-theme-light border border-surface-a10'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Subtab View Rendering */}
      {adminSubTab === 'users' ? (
        <AdminUsersControl />
      ) : adminSubTab === 'stripe' ? (
        <AdminStripeControl />
      ) : adminSubTab === 'capabilities' ? (
        <AdminCapabilitiesControl />
      ) : adminSubTab === 'providers' ? (
        <AdminProvidersControl />
      ) : adminSubTab === 'orders' ? (
        <AdminOrdersControl />
      ) : adminSubTab === 'ledger' ? (
        <AdminLedgerControl />
      ) : adminSubTab === 'webhooks' ? (
        <AdminWebhooksControl />
      ) : adminSubTab === 'api' ? (
        <AdminApiControl />
      ) : adminSubTab === 'security' ? (
        <AdminSecurityControl />
      ) : (
        <>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface-a0 border border-surface-a10 p-5 rounded-2xl shadow-lg">
          <div className="flex items-center justify-between text-surface-a40 text-xs font-mono uppercase">
            <span>Gross Revenue</span>
            <DollarSign className="w-4 h-4 text-info-a0" />
          </div>
          <div className="text-2xl font-bold text-theme-light mt-2">
            ${(data.totalGrossCents / 100).toFixed(2)}
          </div>
          <p className="text-[10px] text-surface-a50 font-mono mt-1">Total Client Purchases</p>
        </div>

        <div className="bg-surface-a0 border border-surface-a10 p-5 rounded-2xl shadow-lg">
          <div className="flex items-center justify-between text-surface-a40 text-xs font-mono uppercase">
            <span>Provider Share (85%)</span>
            <TrendingUp className="w-4 h-4 text-success-a0" />
          </div>
          <div className="text-2xl font-bold text-success-a0 mt-2">
            ${(data.totalProviderCents / 100).toFixed(2)}
          </div>
          <p className="text-[10px] text-surface-a50 font-mono mt-1">Disbursed via Payout Engine</p>
        </div>

        <div className="bg-surface-a0 border border-surface-a10 p-5 rounded-2xl shadow-lg">
          <div className="flex items-center justify-between text-surface-a40 text-xs font-mono uppercase">
            <span>Admin Agent Share (15%)</span>
            <ShieldCheck className="w-4 h-4 text-info-a0" />
          </div>
          <div className="text-2xl font-bold text-info-a0 mt-2">
            ${(data.totalAgentCents / 100).toFixed(2)}
          </div>
          <p className="text-[10px] text-surface-a50 font-mono mt-1">Admin Agent Platform Revenue</p>
        </div>

        <div className="bg-surface-a0 border border-surface-a10 p-5 rounded-2xl shadow-lg">
          <div className="flex items-center justify-between text-surface-a40 text-xs font-mono uppercase">
            <span>Total Orders</span>
            <FileText className="w-4 h-4 text-surface-a40" />
          </div>
          <div className="text-2xl font-bold text-theme-light mt-2">
            {data.ordersCount !== undefined ? data.ordersCount : data.orders.length}
          </div>
          <p className="text-[10px] text-surface-a50 font-mono mt-1">
            Manual Review: <span className="text-warning-a0 font-bold">{data.manualReviewPagination?.total ?? data.manualReviewQueue.length}</span>
          </p>
        </div>
      </div>

      {actionNotice && (
        <div className="bg-success-a0/10 border border-success-a0/30 p-3.5 rounded-xl text-xs font-mono text-success-a0 flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Manual Review Alert Bar if active */}
      {data.manualReviewQueue.length > 0 && (
        <div className="bg-warning-a0/10 border border-warning-a0/30 p-4 rounded-2xl space-y-3">
          <div className="flex items-center space-x-2 text-warning-a0 font-semibold text-sm">
            <AlertTriangle className="w-5 h-5 text-warning-a0" />
            <span>Manual Review Queue ({data.manualReviewPagination?.total ?? data.manualReviewQueue.length} Orders Need Attention)</span>
          </div>

          <div className="space-y-2">
            {data.manualReviewQueue.map((o) => (
              <div key={o.id} className="bg-tonal-a0 p-3 rounded-xl border border-surface-a10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs font-mono">
                <div>
                  <span className="text-info-a0 font-bold">{o.id}</span>
                  <span className="text-surface-a40 ml-2">Amount: ${(o.amountCents / 100).toFixed(2)}</span>
                  <span className="text-surface-a50 ml-2">({new Date(o.createdAt).toLocaleString()})</span>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleManualResolve(o.id, 'settle')}
                    disabled={resolvingOrderId === o.id}
                    className="px-3 py-1 bg-success-a0 hover:bg-success-a10 text-primary-a0 rounded-lg text-[11px] font-semibold flex items-center space-x-1 disabled:opacity-50"
                  >
                    {resolvingOrderId === o.id ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <span>Force Settle</span>
                    )}
                  </button>
                  <button
                    onClick={() => handleManualResolve(o.id, 'void')}
                    disabled={resolvingOrderId === o.id}
                    className="px-3 py-1 bg-danger-a0 hover:bg-danger-a10 text-primary-a0 rounded-lg text-[11px] font-semibold flex items-center space-x-1 disabled:opacity-50"
                  >
                    {resolvingOrderId === o.id ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <span>Void Order</span>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Manual Review Pagination Bar */}
          {data.manualReviewPagination && data.manualReviewPagination.totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-3 border-t border-warning-a0/20 text-xs font-mono">
              <span className="text-surface-a40">
                Page <span className="text-theme-light font-bold">{data.manualReviewPagination.page}</span> of{' '}
                <span className="text-theme-light font-bold">{data.manualReviewPagination.totalPages}</span> ({data.manualReviewPagination.total} records)
              </span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleManualReviewPageChange(data.manualReviewPagination!.page - 1)}
                  disabled={data.manualReviewPagination.page <= 1 || loading}
                  className="px-3 py-1.5 bg-tonal-a0 hover:bg-surface-a10 disabled:opacity-40 text-theme-light rounded-xl border border-surface-a10 transition-all text-xs font-mono"
                >
                  Previous
                </button>
                <button
                  onClick={() => handleManualReviewPageChange(data.manualReviewPagination!.page + 1)}
                  disabled={data.manualReviewPagination.page >= data.manualReviewPagination.totalPages || loading}
                  className="px-3 py-1.5 bg-tonal-a0 hover:bg-surface-a10 disabled:opacity-40 text-theme-light rounded-xl border border-surface-a10 transition-all text-xs font-mono"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Active Escrow Sessions */}
      {activeEscrowSessions.length > 0 && (
        <div className="bg-surface-a0 border border-warning-a0/30 p-5 rounded-2xl space-y-3">
          <div className="flex items-center justify-between text-warning-a0 text-sm font-semibold">
            <div className="flex items-center space-x-2">
              <KeyRound className="w-4 h-4 text-warning-a0" />
              <span>Active Break-Glass Identity Escrow Sessions</span>
            </div>
            <span className="text-xs text-surface-a40 font-mono">Temporary Unmasked Access</span>
          </div>

          <div className="space-y-3">
            {activeEscrowSessions.map((s) => (
              <div key={s.ticketCode} className="bg-tonal-a0 p-4 rounded-xl border border-surface-a10 space-y-2 text-xs font-mono">
                <div className="flex justify-between text-theme-light">
                  <span>Ticket Code: <span className="text-warning-a0">{s.ticketCode}</span></span>
                  <span>Operator: {s.operator}</span>
                </div>
                <div className="text-surface-a40">Reason: {s.reason}</div>
                <div className="p-2 bg-surface-a0 rounded border border-surface-a10 text-theme-light">
                  Client Unmasked Email: <span className="text-success-a0 font-bold select-all">{s.unmaskedClientEmail}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 85/15 Settlements Table */}
      <div className="bg-surface-a0 border border-surface-a10 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-theme-light">Immutable 85/15 Settlements Ledger</h2>
          <span className="text-[10px] font-mono text-surface-a40 uppercase bg-tonal-a0 px-2.5 py-1 rounded border border-surface-a10">
            Zero Rounding Drift
          </span>
        </div>

        {data.settlements.length === 0 ? (
          <p className="text-xs text-surface-a40 font-mono py-4 text-center">No settlements recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-surface-a10 text-surface-a40 uppercase text-[10px]">
                  <th className="pb-3">Order ID</th>
                  <th className="pb-3">Gross</th>
                  <th className="pb-3">Provider Share (85%)</th>
                  <th className="pb-3">Admin Agent Share (15%)</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">Timestamp</th>
                  <th className="pb-3 text-right">Escrow Break-Glass</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-a10 text-theme-light">
                {data.settlements.map((s) => (
                  <tr key={s.orderId}>
                    <td className="py-3 font-mono text-info-a0">{s.orderId}</td>
                    <td className="py-3 font-bold">${(s.grossCents / 100).toFixed(2)}</td>
                    <td className="py-3 text-success-a0 font-semibold">${(s.providerCents / 100).toFixed(2)}</td>
                    <td className="py-3 text-info-a0 font-semibold">${(s.agentCents / 100).toFixed(2)}</td>
                    <td className="py-3">
                      <span className="px-2 py-0.5 rounded text-[10px] uppercase font-semibold bg-success-a0/10 text-success-a0 border border-success-a0/20">
                        {s.status}
                      </span>
                    </td>
                    <td className="py-3 text-surface-a40 text-[11px]">{new Date(s.timestamp).toLocaleString()}</td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => setSelectedOrderIdForEscrow(s.orderId)}
                        className="px-2.5 py-1 bg-warning-a0/10 hover:bg-warning-a0/20 text-warning-a0 border border-warning-a0/30 rounded text-[11px] transition-all flex items-center space-x-1 ml-auto"
                      >
                        <KeyRound className="w-3 h-3" />
                        <span>Break-Glass</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Server Pagination Bar for Settlements */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-surface-a10 text-xs font-mono">
          <span className="text-surface-a40">
            Page <span className="text-theme-light font-bold">{data.settlementsPagination?.page || 1}</span> of{' '}
            <span className="text-theme-light font-bold">{data.settlementsPagination?.totalPages || 1}</span> ({data.settlementsPagination?.total || 0} records)
          </span>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => handleSettlementsPageChange((data.settlementsPagination?.page || 1) - 1)}
              disabled={(data.settlementsPagination?.page || 1) <= 1 || loading}
              className="px-3 py-1.5 bg-tonal-a0 hover:bg-surface-a10 disabled:opacity-40 text-theme-light rounded-xl border border-surface-a10 transition-all text-xs font-mono"
            >
              Previous
            </button>
            <button
              onClick={() => handleSettlementsPageChange((data.settlementsPagination?.page || 1) + 1)}
              disabled={(data.settlementsPagination?.page || 1) >= (data.settlementsPagination?.totalPages || 1) || loading}
              className="px-3 py-1.5 bg-tonal-a0 hover:bg-surface-a10 disabled:opacity-40 text-theme-light rounded-xl border border-surface-a10 transition-all text-xs font-mono"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Payout Logs */}
      <div className="bg-surface-a0 border border-surface-a10 rounded-2xl p-6 shadow-xl space-y-4">
        <h2 className="text-base font-semibold text-theme-light">Provider Payout Execution Ledger</h2>

        {data.payouts.length === 0 ? (
          <p className="text-xs text-surface-a40 font-mono py-4 text-center">No payouts issued yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-surface-a10 text-surface-a40 uppercase text-[10px]">
                  <th className="pb-3">Payout ID</th>
                  <th className="pb-3">Order ID</th>
                  <th className="pb-3">Recipient Payout Email</th>
                  <th className="pb-3">Amount</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">Disbursement Batch ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-a10 text-theme-light">
                {data.payouts.map((p) => (
                  <tr key={p.payoutId}>
                    <td className="py-3 font-mono text-info-a0">{p.payoutId}</td>
                    <td className="py-3 text-surface-a40">{p.orderId}</td>
                    <td className="py-3 text-theme-light">{p.recipientEmail}</td>
                    <td className="py-3 font-bold text-success-a0">${(p.amountCents / 100).toFixed(2)}</td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-semibold ${
                        p.status === 'completed' || p.status === 'submitted'
                          ? 'bg-success-a0/10 text-success-a0 border border-success-a0/20'
                          : 'bg-danger-a0/10 text-danger-a0 border border-danger-a0/20'
                      }`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="py-3 text-surface-a40 text-[11px]">{p.payoutId || 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Server Pagination Bar for Payouts */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-surface-a10 text-xs font-mono">
          <span className="text-surface-a40">
            Page <span className="text-theme-light font-bold">{data.payoutsPagination?.page || 1}</span> of{' '}
            <span className="text-theme-light font-bold">{data.payoutsPagination?.totalPages || 1}</span> ({data.payoutsPagination?.total || 0} records)
          </span>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => handlePayoutsPageChange((data.payoutsPagination?.page || 1) - 1)}
              disabled={(data.payoutsPagination?.page || 1) <= 1 || loading}
              className="px-3 py-1.5 bg-tonal-a0 hover:bg-surface-a10 disabled:opacity-40 text-theme-light rounded-xl border border-surface-a10 transition-all text-xs font-mono"
            >
              Previous
            </button>
            <button
              onClick={() => handlePayoutsPageChange((data.payoutsPagination?.page || 1) + 1)}
              disabled={(data.payoutsPagination?.page || 1) >= (data.payoutsPagination?.totalPages || 1) || loading}
              className="px-3 py-1.5 bg-tonal-a0 hover:bg-surface-a10 disabled:opacity-40 text-theme-light rounded-xl border border-surface-a10 transition-all text-xs font-mono"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Diagnostic Security & Session Inactivity Overview */}
      {data.securityAnalytics && (
        <div className="bg-surface-a0 border border-surface-a10 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-surface-a10 pb-3">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-info-a0" />
              <h3 className="text-sm font-semibold text-theme-light">Session Duration & Inactivity Diagnostics</h3>
            </div>
            <button
              onClick={() => handleSubTabChange('security')}
              className="text-xs text-info-a0 hover:text-theme-light font-mono flex items-center space-x-1 self-start sm:self-auto"
            >
              <span>View Deep Analytics →</span>
            </button>
          </div>

          {/* Abnormal Session Anomaly Alert Banner */}
          {(data.securityAnalytics.abnormalSessionsCount || 0) > 0 && (
            <div
              id="abnormal-sessions-alert-banner"
              className="bg-warning-a0/15 border border-warning-a0/40 rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs font-mono text-warning-a0"
            >
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-warning-a0 flex-shrink-0 animate-bounce" />
                <span>
                  <strong>Abnormal Session Duration Alert:</strong> {data.securityAnalytics.abnormalSessionsCount} session(s) exceeded the {data.securityAnalytics.abnormalSessionThresholdMinutes || sessionConfig.abnormalThresholdMinutes}m threshold ({((data.securityAnalytics.abnormalSessionThresholdMinutes || sessionConfig.abnormalThresholdMinutes) * 60)}s). Flagged for compliance review.
                </span>
              </div>
              <button
                type="button"
                id="filter-abnormal-sessions-btn"
                onClick={() => handleAuditFilterChange('ABNORMAL_DURATION')}
                className="px-2.5 py-1 bg-warning-a0/20 hover:bg-warning-a0/30 text-warning-a0 border border-warning-a0/40 rounded-lg text-[11px] font-bold self-end sm:self-auto transition-all"
              >
                Filter Flagged Events ({data.securityAnalytics.abnormalSessionsCount})
              </button>
            </div>
          )}

          {/* Diagnostic KPI Metrics (5 Columns) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-xs font-mono">
            <div className="bg-tonal-a0 p-3 rounded-xl border border-surface-a10">
              <span className="text-[10px] text-surface-a40 uppercase block">Monitored Sessions</span>
              <span className="text-base font-bold text-theme-light">{data.securityAnalytics.totalMonitoredSessions}</span>
              <span className="text-[10px] text-success-a0 block mt-0.5">● {data.securityAnalytics.activeSessionsCount} active</span>
            </div>

            <div className="bg-tonal-a0 p-3 rounded-xl border border-surface-a10">
              <span className="text-[10px] text-surface-a40 uppercase block">Avg Session Duration</span>
              <span className="text-base font-bold text-theme-light">
                {Math.floor(data.securityAnalytics.averageSessionDurationSeconds / 60)}m {data.securityAnalytics.averageSessionDurationSeconds % 60}s
              </span>
              <span className="text-[10px] text-surface-a50 block mt-0.5">
                Peak: {Math.floor(data.securityAnalytics.maxSessionDurationSeconds / 60)}m {data.securityAnalytics.maxSessionDurationSeconds % 60}s
                {data.securityAnalytics.maxSessionDurationSeconds >= ((data.securityAnalytics.abnormalSessionThresholdMinutes || 45) * 60) && (
                  <span className="text-warning-a0 font-bold ml-1">(! anomaly)</span>
                )}
              </span>
            </div>

            <div className="bg-tonal-a0 p-3 rounded-xl border border-surface-a10">
              <span className="text-[10px] text-surface-a40 uppercase block">
                {data.securityAnalytics.idleTimeoutMinutes || 15}m Idle Timeouts
              </span>
              <span className={`text-base font-bold ${data.securityAnalytics.totalIdleTimeouts > 0 ? 'text-warning-a0' : 'text-theme-light'}`}>
                {data.securityAnalytics.totalIdleTimeouts}
              </span>
              <span className="text-[10px] text-surface-a50 block mt-0.5">{data.securityAnalytics.idleTimeoutRatePercentage}% rate</span>
            </div>

            <div className="bg-tonal-a0 p-3 rounded-xl border border-surface-a10">
              <span className="text-[10px] text-surface-a40 uppercase block">
                {data.securityAnalytics.idleWarningMinutes || 10}m Idle Warnings
              </span>
              <span className="text-base font-bold text-info-a0">{data.securityAnalytics.totalIdleWarnings}</span>
              <span className="text-[10px] text-surface-a50 block mt-0.5">Pre-lockout alerts</span>
            </div>

            {/* 5th KPI: Abnormal Session Threshold Anomaly Card */}
            <div
              id="kpi-abnormal-sessions-card"
              className={`p-3 rounded-xl border font-mono transition-all ${
                (data.securityAnalytics.abnormalSessionsCount || 0) > 0
                  ? 'bg-warning-a0/10 border-warning-a0/50 text-warning-a0 ring-1 ring-warning-a0/30'
                  : 'bg-tonal-a0 border-surface-a10 text-theme-light'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-surface-a40 uppercase block truncate">
                  &gt; {data.securityAnalytics.abnormalSessionThresholdMinutes || sessionConfig.abnormalThresholdMinutes}m Abnormal
                </span>
                {(data.securityAnalytics.abnormalSessionsCount || 0) > 0 && (
                  <AlertTriangle className="w-3.5 h-3.5 text-warning-a0 flex-shrink-0" />
                )}
              </div>
              <span className={`text-base font-bold ${(data.securityAnalytics.abnormalSessionsCount || 0) > 0 ? 'text-warning-a0' : 'text-theme-light'}`}>
                {data.securityAnalytics.abnormalSessionsCount || 0}
              </span>
              <span className="text-[10px] text-surface-a50 block mt-0.5">
                {(data.securityAnalytics.abnormalSessionsCount || 0) > 0
                  ? '⚠️ Flagged for review'
                  : 'Within policy limit'}
              </span>
            </div>
          </div>

          {/* Admin Dynamic Policy Controls (Idle Timeout & Abnormal Session Threshold) */}
          <div className="pt-2 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <AdminIdleTimeoutSetting onUpdated={() => fetchOverview()} />
            <AdminAbnormalSessionSetting
              abnormalSessionsCount={data.securityAnalytics.abnormalSessionsCount}
              onUpdated={() => fetchOverview()}
            />
          </div>

          {/* Detailed Flagged Abnormal Sessions List (if any detected) */}
          {data.securityAnalytics.abnormalSessionsList && data.securityAnalytics.abnormalSessionsList.length > 0 && (
            <div
              id="abnormal-sessions-table-card"
              className="bg-tonal-a0 border border-warning-a0/30 rounded-xl p-3.5 space-y-2 text-xs font-mono"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-warning-a0 font-bold">
                  <AlertTriangle className="w-3.5 h-3.5 text-warning-a0" />
                  <span>Flagged Abnormal Duration Sessions ({data.securityAnalytics.abnormalSessionsList.length})</span>
                </div>
                <span className="text-[11px] text-surface-a40">
                  Threshold: {data.securityAnalytics.abnormalSessionThresholdMinutes || 45} mins
                </span>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {data.securityAnalytics.abnormalSessionsList.map((s) => (
                  <div
                    key={s.sessionId}
                    className="p-2.5 rounded-lg bg-surface-a0 border border-warning-a0/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-theme-light truncate max-w-[140px] sm:max-w-[200px]">
                        {s.sessionId}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-warning-a0/20 text-warning-a0 border border-warning-a0/40 font-bold">
                        {Math.floor(s.sessionDurationSeconds / 60)}m {s.sessionDurationSeconds % 60}s
                      </span>
                      <span className="text-surface-a40 text-[10px]">by {s.operator}</span>
                    </div>
                    <div className="flex items-center space-x-3 text-[10px] text-surface-a50">
                      <span>Event: {s.eventType}</span>
                      <span>{new Date(s.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 30-Day Session Duration & Activity Trends Summary Chart (recharts) */}
      <SessionTrendsChart
        trends={data?.securityAnalytics?.dailyTrends30Days}
        title="30-Day Session Duration & Activity Trends"
        subtitle="Summary telemetry of user session durations, active connections, and inactivity metrics over the last 30 days"
      />

      {/* Security Audit Event Trail */}
      <div className="bg-surface-a0 border border-surface-a10 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-theme-light">Security & Audit Event Stream</h2>

          <div className="flex items-center space-x-2">
            <label className="text-xs text-surface-a40 font-mono">Filter Event:</label>
            <select
              value={auditFilter}
              onChange={(e) => handleAuditFilterChange(e.target.value)}
              className="bg-tonal-a0 border border-surface-a10 text-xs text-theme-light font-mono px-3 py-1.5 rounded-xl focus:outline-none focus:border-info-a0"
            >
              <option value="ALL">ALL EVENTS</option>
              <option value="ABNORMAL_DURATION">
                ⚠️ ABNORMAL DURATION SESSIONS ONLY {data?.securityAnalytics?.abnormalSessionsCount ? `(${data.securityAnalytics.abnormalSessionsCount})` : ''}
              </option>
              <option value="SESSION_IDLE_TIMEOUT">SESSION_IDLE_TIMEOUT</option>
              <option value="SESSION_IDLE_WARNING">SESSION_IDLE_WARNING</option>
              <option value="SESSION_STARTED">SESSION_STARTED</option>
              <option value="SESSION_HEARTBEAT">SESSION_HEARTBEAT</option>
              <option value="SESSION_ENDED">SESSION_ENDED</option>
              <option value="ORDER_CREATED">ORDER_CREATED</option>
              <option value="PAYMENT_VERIFIED">PAYMENT_VERIFIED</option>
              <option value="SETTLEMENT_CREATED">SETTLEMENT_CREATED</option>
              <option value="PAYOUT_SUCCEEDED">PAYOUT_SUCCEEDED</option>
              <option value="ENTITLEMENT_REDEEMED">ENTITLEMENT_REDEEMED</option>
              <option value="ESCROW_ACCESSED">ESCROW_ACCESSED</option>
              <option value="MANUAL_REVIEW_OPENED">MANUAL_REVIEW_OPENED</option>
            </select>
          </div>
        </div>

        {data.auditEvents.length === 0 ? (
          <p className="text-xs text-surface-a40 font-mono py-4 text-center">No matching audit events.</p>
        ) : (
          <div className="space-y-2 max-h-[440px] overflow-y-auto pr-2">
            {data.auditEvents.map((evt) => {
              const abnormalThresholdSeconds = (data.securityAnalytics?.abnormalSessionThresholdMinutes || sessionConfig.abnormalThresholdMinutes) * 60;
              const evtDuration = Number(evt.details?.sessionDurationSeconds) || 0;
              const isAbnormal = evt.isAbnormalDuration || evtDuration >= abnormalThresholdSeconds;

              return (
                <div
                  key={evt.id}
                  className={`p-3 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs font-mono gap-2 transition-all ${
                    isAbnormal
                      ? 'bg-warning-a0/10 border-warning-a0/50 ring-1 ring-warning-a0/30 shadow-sm'
                      : 'bg-tonal-a0 border-surface-a10'
                  }`}
                >
                  <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        evt.eventType.includes('TIMEOUT')
                          ? 'bg-danger-a0/10 text-danger-a0 border border-danger-a0/30'
                          : evt.eventType.includes('WARNING')
                          ? 'bg-warning-a0/10 text-warning-a0 border border-warning-a0/30'
                          : evt.eventType.includes('SUCCESS') || evt.eventType.includes('VERIFIED') || evt.eventType.includes('REDEEMED')
                          ? 'bg-success-a0/10 text-success-a0 border border-success-a0/20'
                          : evt.eventType.includes('ESCROW') || evt.eventType.includes('MANUAL')
                          ? 'bg-warning-a0/10 text-warning-a0 border border-warning-a0/20'
                          : 'bg-info-a0/10 text-info-a0 border border-info-a0/20'
                      }`}
                    >
                      {evt.eventType}
                    </span>

                    {/* Abnormal Session Anomaly Highlight Badge */}
                    {isAbnormal && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-warning-a0/20 text-warning-a0 border border-warning-a0/40 flex items-center space-x-1 animate-pulse">
                        <AlertTriangle className="w-3 h-3 text-warning-a0" />
                        <span>
                          ABNORMAL DURATION{' '}
                          {evtDuration > 0
                            ? `(${Math.floor(evtDuration / 60)}m ${evtDuration % 60}s)`
                            : `(>${Math.floor(abnormalThresholdSeconds / 60)}m)`}
                        </span>
                      </span>
                    )}

                    <span className="text-surface-a40">by {evt.operator}</span>
                  </div>

                  <div className="text-surface-a50 text-[11px] truncate max-w-md">
                    {JSON.stringify(evt.details)}
                  </div>

                  <div className="text-[10px] text-surface-a50 whitespace-nowrap">
                    {new Date(evt.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Server Pagination Bar for Audit Events */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-surface-a10 text-xs font-mono">
          <span className="text-surface-a40">
            Page <span className="text-theme-light font-bold">{data.auditEventsPagination?.page || 1}</span> of{' '}
            <span className="text-theme-light font-bold">{data.auditEventsPagination?.totalPages || 1}</span> ({data.auditEventsPagination?.total || 0} records)
          </span>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => handleAuditEventsPageChange((data.auditEventsPagination?.page || 1) - 1)}
              disabled={(data.auditEventsPagination?.page || 1) <= 1 || loading}
              className="px-3 py-1.5 bg-tonal-a0 hover:bg-surface-a10 disabled:opacity-40 text-theme-light rounded-xl border border-surface-a10 transition-all text-xs font-mono"
            >
              Previous
            </button>
            <button
              onClick={() => handleAuditEventsPageChange((data.auditEventsPagination?.page || 1) + 1)}
              disabled={(data.auditEventsPagination?.page || 1) >= (data.auditEventsPagination?.totalPages || 1) || loading}
              className="px-3 py-1.5 bg-tonal-a0 hover:bg-surface-a10 disabled:opacity-40 text-theme-light rounded-xl border border-surface-a10 transition-all text-xs font-mono"
            >
              Next
            </button>
          </div>
        </div>
      </div>
      </>
      )}

      {/* Escrow Modal rendering */}
      {selectedOrderIdForEscrow && (
        <EscrowModal
          orderId={selectedOrderIdForEscrow}
          onClose={() => setSelectedOrderIdForEscrow(null)}
          onSessionCreated={(session) => {
            setActiveEscrowSessions((prev) => [session, ...prev]);
            setSelectedOrderIdForEscrow(null);
          }}
        />
      )}
    </div>
  );
};
