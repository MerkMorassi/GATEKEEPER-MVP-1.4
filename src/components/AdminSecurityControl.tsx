import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Clock,
  AlertTriangle,
  RefreshCw,
  Activity,
  UserCheck,
  Zap,
  Download,
  CheckCircle2,
  Lock,
  Timer,
} from 'lucide-react';
import { SessionSecurityAnalytics, AuditEvent } from '../types';
import { apiFetch } from '../lib/api';
import { SessionTrendsChart } from './SessionTrendsChart';
import { AdminIdleTimeoutSetting } from './AdminIdleTimeoutSetting';
import { AdminAbnormalSessionSetting } from './AdminAbnormalSessionSetting';
import { sessionConfig } from '../lib/sessionConfig';

export const AdminSecurityControl: React.FC = () => {
  const [analytics, setAnalytics] = useState<SessionSecurityAnalytics | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('ALL');
  const [triggeringTest, setTriggeringTest] = useState<boolean>(false);

  useEffect(() => {
    fetchSecurityAnalytics();
  }, []);

  const fetchSecurityAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch('/api/admin/security-analytics');
      const json = await res.json();
      if (json.success && json.analytics) {
        setAnalytics(json.analytics);
      } else {
        setError(json.error || 'Failed to load security analytics');
      }
    } catch (err: any) {
      setError('Network error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number): string => {
    if (!seconds || seconds <= 0) return '0s';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  const triggerTestHeartbeat = async () => {
    try {
      setTriggeringTest(true);
      const res = await apiFetch('/api/diagnostics/session-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: `sess_test_${Date.now()}`,
          eventType: 'SESSION_HEARTBEAT',
          operator: 'admin_test_operator',
          details: {
            sessionDurationSeconds: 45,
            idleSeconds: 0,
            reason: 'Manual diagnostic probe dispatched from Agent Audit',
            testedAt: new Date().toISOString(),
          },
        }),
      });
      const json = await res.json();
      if (json.success) {
        setNotice('Diagnostic test probe successfully dispatched & logged ✓');
        setTimeout(() => setNotice(null), 3500);
        await fetchSecurityAnalytics();
      } else {
        setError(json.error || 'Failed to trigger probe');
      }
    } catch (err: any) {
      setError('Probe failed: ' + err.message);
    } finally {
      setTriggeringTest(false);
    }
  };

  const exportDiagnosticsJson = () => {
    if (!analytics || !analytics.recentDiagnostics) return;
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(analytics, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `gatekeeper-security-diagnostics-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    setNotice('Diagnostics telemetry exported to JSON ✓');
    setTimeout(() => setNotice(null), 3000);
  };

  const abnormalThresholdSeconds = (analytics?.abnormalSessionThresholdMinutes || sessionConfig.abnormalThresholdMinutes) * 60;

  const filteredDiagnostics = (analytics?.recentDiagnostics || []).filter((evt) => {
    if (filterType === 'ALL') return true;
    if (filterType === 'ABNORMAL_DURATION') {
      const dur = Number(evt.details?.sessionDurationSeconds) || 0;
      return evt.isAbnormalDuration || dur >= abnormalThresholdSeconds;
    }
    return evt.eventType === filterType;
  });

  return (
    <div className="space-y-6">
      {/* Top Header & Operational Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface-a0 border border-surface-a10 p-6 rounded-2xl shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-5 h-5 text-info-a0" />
            <h2 className="text-lg font-bold text-theme-light">Session Duration & Inactivity Diagnostics</h2>
          </div>
          <p className="text-xs text-surface-a40 font-mono">
            Real-time security analytics tracking user session lifecycle, idle warning events, and dynamic inactivity & abnormal duration thresholds.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={triggerTestHeartbeat}
            disabled={triggeringTest || loading}
            className="px-3.5 py-2 bg-info-a0/10 hover:bg-info-a0/20 text-info-a0 text-xs font-mono rounded-xl border border-info-a0/30 transition-all flex items-center space-x-2 disabled:opacity-50"
            title="Dispatch a test diagnostic heartbeat probe"
          >
            <Activity className="w-3.5 h-3.5" />
            <span>{triggeringTest ? 'Probing...' : 'Test Probe'}</span>
          </button>

          <button
            onClick={exportDiagnosticsJson}
            disabled={!analytics}
            className="px-3.5 py-2 bg-tonal-a0 hover:bg-surface-a10 text-theme-light text-xs font-mono rounded-xl border border-surface-a10 transition-all flex items-center space-x-2 disabled:opacity-50"
            title="Export full diagnostics dataset as JSON"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>

          <button
            onClick={fetchSecurityAnalytics}
            disabled={loading}
            className="p-2 bg-tonal-a0 hover:bg-surface-a10 text-theme-light rounded-xl border border-surface-a10 transition-all disabled:opacity-50"
            title="Refresh analytics"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-info-a0' : ''}`} />
          </button>
        </div>
      </div>

      {notice && (
        <div className="p-3 bg-success-a0/10 border border-success-a0/30 text-success-a0 text-xs font-mono rounded-xl flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-danger-a0/10 border border-danger-a0/30 text-danger-a0 text-xs font-mono rounded-xl flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Abnormal Session Anomaly Alert Banner */}
      {(analytics?.abnormalSessionsCount || 0) > 0 && (
        <div
          id="admin-security-abnormal-alert-banner"
          className="bg-warning-a0/15 border border-warning-a0/40 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs font-mono text-warning-a0 shadow-md"
        >
          <div className="flex items-center space-x-2.5">
            <AlertTriangle className="w-5 h-5 text-warning-a0 flex-shrink-0 animate-bounce" />
            <div>
              <strong className="text-sm font-sans font-semibold block sm:inline">Abnormal Session Duration Threshold Exceeded:</strong>{' '}
              <span>
                {analytics?.abnormalSessionsCount} session(s) exceeded the {analytics?.abnormalSessionThresholdMinutes || sessionConfig.abnormalThresholdMinutes}m limit. Visual audit highlights enabled.
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setFilterType('ABNORMAL_DURATION')}
            className="px-3 py-1.5 bg-warning-a0/20 hover:bg-warning-a0/30 text-warning-a0 border border-warning-a0/40 rounded-xl text-xs font-bold shrink-0 transition-all"
          >
            Filter Flagged Sessions ({analytics?.abnormalSessionsCount})
          </button>
        </div>
      )}

      {/* Primary KPI Metrics (5 Columns) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Monitored Sessions */}
        <div className="bg-surface-a0 border border-surface-a10 p-5 rounded-2xl shadow-lg">
          <div className="flex items-center justify-between text-surface-a40 text-xs font-mono uppercase">
            <span>Monitored Sessions</span>
            <UserCheck className="w-4 h-4 text-info-a0" />
          </div>
          <div className="text-2xl font-bold text-theme-light mt-2">
            {analytics ? analytics.totalMonitoredSessions : '--'}
          </div>
          <div className="flex items-center space-x-1.5 mt-1.5 text-[10px] font-mono text-surface-a40">
            <span className="w-2 h-2 rounded-full bg-success-a0 animate-pulse"></span>
            <span>{analytics ? analytics.activeSessionsCount : 0} Active (Last 15m)</span>
          </div>
        </div>

        {/* Avg Session Duration */}
        <div className="bg-surface-a0 border border-surface-a10 p-5 rounded-2xl shadow-lg">
          <div className="flex items-center justify-between text-surface-a40 text-xs font-mono uppercase">
            <span>Avg Session Duration</span>
            <Clock className="w-4 h-4 text-theme-light" />
          </div>
          <div className="text-2xl font-bold text-theme-light mt-2">
            {analytics ? formatDuration(analytics.averageSessionDurationSeconds) : '--'}
          </div>
          <div className="text-[10px] text-surface-a50 font-mono mt-1.5">
            Peak: {analytics ? formatDuration(analytics.maxSessionDurationSeconds) : '--'}
            {analytics && analytics.maxSessionDurationSeconds >= abnormalThresholdSeconds && (
              <span className="text-warning-a0 font-bold ml-1">(! anomaly)</span>
            )}
          </div>
        </div>

        {/* Idle Timeouts Triggered */}
        <div className="bg-surface-a0 border border-surface-a10 p-5 rounded-2xl shadow-lg">
          <div className="flex items-center justify-between text-surface-a40 text-xs font-mono uppercase">
            <span>{analytics?.idleTimeoutMinutes || 15}m Idle Timeouts</span>
            <Timer className="w-4 h-4 text-warning-a0" />
          </div>
          <div className="text-2xl font-bold text-warning-a0 mt-2">
            {analytics ? analytics.totalIdleTimeouts : '--'}
          </div>
          <div className="text-[10px] text-surface-a50 font-mono mt-1.5">
            Timeout Rate: {analytics ? `${analytics.idleTimeoutRatePercentage}%` : '--'}
          </div>
        </div>

        {/* Inactivity Warnings */}
        <div className="bg-surface-a0 border border-surface-a10 p-5 rounded-2xl shadow-lg">
          <div className="flex items-center justify-between text-surface-a40 text-xs font-mono uppercase">
            <span>{analytics?.idleWarningMinutes || 10}m Idle Warnings</span>
            <AlertTriangle className="w-4 h-4 text-info-a0" />
          </div>
          <div className="text-2xl font-bold text-info-a0 mt-2">
            {analytics ? analytics.totalIdleWarnings : '--'}
          </div>
          <div className="text-[10px] text-surface-a50 font-mono mt-1.5">
            Pre-timeout Inactivity Signals
          </div>
        </div>

        {/* 5th KPI: Abnormal Sessions Flagged */}
        <div
          id="admin-security-abnormal-kpi-card"
          className={`p-5 rounded-2xl shadow-lg border transition-all ${
            (analytics?.abnormalSessionsCount || 0) > 0
              ? 'bg-warning-a0/10 border-warning-a0/50 ring-1 ring-warning-a0/30 text-warning-a0'
              : 'bg-surface-a0 border border-surface-a10 text-theme-light'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-mono uppercase">
            <span className="truncate">&gt; {analytics?.abnormalSessionThresholdMinutes || sessionConfig.abnormalThresholdMinutes}m Abnormal</span>
            <AlertTriangle className={`w-4 h-4 ${(analytics?.abnormalSessionsCount || 0) > 0 ? 'text-warning-a0' : 'text-surface-a40'}`} />
          </div>
          <div className={`text-2xl font-bold mt-2 ${(analytics?.abnormalSessionsCount || 0) > 0 ? 'text-warning-a0' : 'text-theme-light'}`}>
            {analytics ? analytics.abnormalSessionsCount : '--'}
          </div>
          <div className="text-[10px] text-surface-a50 font-mono mt-1.5">
            {(analytics?.abnormalSessionsCount || 0) > 0 ? '⚠️ High-duration anomalies' : 'Zero duration anomalies'}
          </div>
        </div>
      </div>

      {/* Dynamic Policy Controls (Idle Timeout & Abnormal Session Threshold) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AdminIdleTimeoutSetting onUpdated={() => fetchSecurityAnalytics()} />
        <AdminAbnormalSessionSetting
          abnormalSessionsCount={analytics?.abnormalSessionsCount}
          onUpdated={() => fetchSecurityAnalytics()}
        />
      </div>

      {/* Detailed Flagged Abnormal Sessions List */}
      {analytics?.abnormalSessionsList && analytics.abnormalSessionsList.length > 0 && (
        <div
          id="admin-security-abnormal-sessions-table"
          className="bg-surface-a0 border border-warning-a0/30 p-5 rounded-2xl shadow-lg space-y-3 font-mono text-xs"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-theme-light flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-warning-a0" />
              <span>Flagged High-Duration Sessions ({analytics.abnormalSessionsList.length})</span>
            </h3>
            <span className="text-[11px] text-surface-a40">
              Threshold: {analytics.abnormalSessionThresholdMinutes || 45} minutes
            </span>
          </div>

          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
            {analytics.abnormalSessionsList.map((s) => (
              <div
                key={s.sessionId}
                className="p-3 rounded-xl bg-tonal-a0 border border-warning-a0/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-theme-light truncate max-w-[150px] sm:max-w-[220px]">
                    {s.sessionId}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-warning-a0/20 text-warning-a0 border border-warning-a0/40 font-bold">
                    {formatDuration(s.sessionDurationSeconds)}
                  </span>
                  <span className="text-surface-a40 text-[10px]">by {s.operator}</span>
                </div>

                <div className="flex items-center space-x-3 text-[10px] text-surface-a50">
                  <span>Last event: {s.eventType}</span>
                  <span>{new Date(s.timestamp).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 30-Day Session Duration & Activity Trends Chart (recharts) */}
      <SessionTrendsChart
        trends={analytics?.dailyTrends30Days}
        title="30-Day Diagnostic Session Duration & Activity Trends"
        subtitle="Historical trend analysis generated from persistent audit telemetry and session activity signals"
      />

      {/* Security Inactivity Policies Checklist */}
      <div className="bg-surface-a0 border border-surface-a10 p-5 rounded-2xl shadow-lg space-y-3">
        <h3 className="text-sm font-semibold text-theme-light flex items-center space-x-2">
          <Lock className="w-4 h-4 text-info-a0" />
          <span>Enforced Inactivity & Diagnostic Policies</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
          <div className="bg-tonal-a0 p-3 rounded-xl border border-surface-a10 space-y-1">
            <div className="flex items-center space-x-1.5 text-success-a0 font-bold">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>{analytics?.idleTimeoutMinutes || 15}-Minute Hard Lockout</span>
            </div>
            <p className="text-[11px] text-surface-a40">
              Users inactive across all tabs are automatically logged out, tokens cleared, and session ended.
            </p>
          </div>

          <div className="bg-tonal-a0 p-3 rounded-xl border border-surface-a10 space-y-1">
            <div className="flex items-center space-x-1.5 text-info-a0 font-bold">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>{analytics?.idleWarningMinutes || 10}-Minute Warning Telemetry</span>
            </div>
            <p className="text-[11px] text-surface-a40">
              Captures pre-timeout warning telemetry to distinguish active abandonment from deliberate departure.
            </p>
          </div>

          <div className="bg-tonal-a0 p-3 rounded-xl border border-surface-a10 space-y-1">
            <div className="flex items-center space-x-1.5 text-warning-a0 font-bold">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>{analytics?.abnormalSessionThresholdMinutes || 45}-Minute Anomaly Alert</span>
            </div>
            <p className="text-[11px] text-surface-a40">
              Highlights and flags active sessions exceeding duration thresholds in the audit telemetry stream.
            </p>
          </div>

          <div className="bg-tonal-a0 p-3 rounded-xl border border-surface-a10 space-y-1">
            <div className="flex items-center space-x-1.5 text-theme-light font-bold">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>Double-Blind Audit Trail</span>
            </div>
            <p className="text-[11px] text-surface-a40">
              All telemetry timestamps and duration statistics are encrypted and scrubbed of raw PII.
            </p>
          </div>
        </div>
      </div>

      {/* Session Diagnostics Event Stream */}
      <div className="bg-surface-a0 border border-surface-a10 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <Activity className="w-4 h-4 text-info-a0" />
            <h3 className="text-base font-semibold text-theme-light">Session Diagnostic Events Log</h3>
          </div>

          <div className="flex items-center space-x-2">
            <label className="text-xs text-surface-a40 font-mono">Filter Event:</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-tonal-a0 border border-surface-a10 text-xs text-theme-light font-mono px-3 py-1.5 rounded-xl focus:outline-none focus:border-info-a0"
            >
              <option value="ALL">ALL DIAGNOSTIC EVENTS</option>
              <option value="ABNORMAL_DURATION">
                ⚠️ ABNORMAL DURATION ONLY {analytics?.abnormalSessionsCount ? `(${analytics.abnormalSessionsCount})` : ''}
              </option>
              <option value="SESSION_IDLE_TIMEOUT">SESSION_IDLE_TIMEOUT</option>
              <option value="SESSION_IDLE_WARNING">SESSION_IDLE_WARNING</option>
              <option value="SESSION_STARTED">SESSION_STARTED</option>
              <option value="SESSION_HEARTBEAT">SESSION_HEARTBEAT</option>
              <option value="SESSION_ENDED">SESSION_ENDED</option>
            </select>
          </div>
        </div>

        {filteredDiagnostics.length === 0 ? (
          <div className="text-center py-8 text-xs font-mono text-surface-a40 space-y-2">
            <p>No diagnostic events matching current filter.</p>
            <p className="text-[11px] text-surface-a50">
              Events are generated dynamically as authenticated users interact, idle, or logout.
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[440px] overflow-y-auto pr-2">
            {filteredDiagnostics.map((evt: AuditEvent) => {
              const isTimeout = evt.eventType === 'SESSION_IDLE_TIMEOUT';
              const isWarning = evt.eventType === 'SESSION_IDLE_WARNING';
              const isStarted = evt.eventType === 'SESSION_STARTED';
              const isEnded = evt.eventType === 'SESSION_ENDED';
              const durSec = Number(evt.details?.sessionDurationSeconds) || 0;
              const isAbnormal = evt.isAbnormalDuration || durSec >= abnormalThresholdSeconds;

              return (
                <div
                  key={evt.id}
                  className={`p-3 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs font-mono gap-2 transition-all ${
                    isAbnormal
                      ? 'bg-warning-a0/10 border-warning-a0/50 ring-1 ring-warning-a0/30 shadow-sm'
                      : 'bg-tonal-a0 border-surface-a10 hover:border-surface-a20'
                  }`}
                >
                  <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        isTimeout
                          ? 'bg-danger-a0/10 text-danger-a0 border border-danger-a0/30'
                          : isWarning
                          ? 'bg-warning-a0/10 text-warning-a0 border border-warning-a0/30'
                          : isStarted
                          ? 'bg-success-a0/10 text-success-a0 border border-success-a0/30'
                          : isEnded
                          ? 'bg-surface-a30/20 text-surface-a40 border border-surface-a30/30'
                          : 'bg-info-a0/10 text-info-a0 border border-info-a0/30'
                      }`}
                    >
                      {evt.eventType}
                    </span>

                    {/* Abnormal Session Duration Highlight Badge */}
                    {isAbnormal && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-warning-a0/20 text-warning-a0 border border-warning-a0/40 flex items-center space-x-1 animate-pulse">
                        <AlertTriangle className="w-3 h-3 text-warning-a0" />
                        <span>
                          ABNORMAL DURATION {durSec > 0 ? `(${formatDuration(durSec)})` : `(>${Math.floor(abnormalThresholdSeconds / 60)}m)`}
                        </span>
                      </span>
                    )}

                    <span className="text-surface-a40">role: {evt.operator}</span>
                  </div>

                  <div className="text-surface-a50 text-[11px] truncate max-w-md">
                    {evt.details?.reason || JSON.stringify(evt.details)}
                  </div>

                  <div className="flex items-center space-x-3 text-[10px] text-surface-a50 shrink-0">
                    {evt.details?.sessionDurationSeconds !== undefined && (
                      <span className={isAbnormal ? 'text-warning-a0 font-bold' : 'text-theme-light'}>
                        dur: {formatDuration(Number(evt.details.sessionDurationSeconds))}
                      </span>
                    )}
                    {evt.details?.idleSeconds !== undefined && (
                      <span className="text-warning-a0">
                        idle: {formatDuration(Number(evt.details.idleSeconds))}
                      </span>
                    )}
                    <span>{new Date(evt.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
