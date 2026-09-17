import React, { useState, useEffect } from 'react';
import { AlertTriangle, Clock, ShieldAlert, Save, CheckCircle2, AlertCircle, RefreshCw, RotateCcw } from 'lucide-react';
import {
  sessionConfig,
  DEFAULT_ABNORMAL_SESSION_THRESHOLD_MINUTES,
  ABNORMAL_SESSION_THRESHOLD_MINUTES,
  ABNORMAL_SESSION_THRESHOLD_SECONDS,
} from '../lib/sessionConfig';

interface AdminAbnormalSessionSettingProps {
  onUpdated?: (newThresholdMinutes: number) => void;
  abnormalSessionsCount?: number;
  compact?: boolean;
}

export const AdminAbnormalSessionSetting: React.FC<AdminAbnormalSessionSettingProps> = ({
  onUpdated,
  abnormalSessionsCount,
  compact = false,
}) => {
  const [thresholdMinutes, setThresholdMinutes] = useState<number>(sessionConfig.abnormalThresholdMinutes);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setThresholdMinutes(sessionConfig.abnormalThresholdMinutes);

    const unsubscribe = sessionConfig.subscribe((_, newAbnormal) => {
      setThresholdMinutes(newAbnormal);
    });

    sessionConfig.fetchServerPreference().then((prefs) => {
      if (prefs && prefs.abnormalThresholdMinutes) {
        setThresholdMinutes(prefs.abnormalThresholdMinutes);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleSave = async (targetMinutes?: number) => {
    const minsToSave = targetMinutes !== undefined ? targetMinutes : thresholdMinutes;
    const sanitized = Math.max(1, Math.min(480, Math.round(minsToSave)));

    setIsSaving(true);
    setStatusMessage(null);

    const result = await sessionConfig.saveAbnormalThreshold(sanitized);

    setIsSaving(false);
    if (result.success) {
      setThresholdMinutes(result.abnormalThresholdMinutes);
      setStatusMessage({
        type: 'success',
        text: `Abnormal session threshold updated to ${result.abnormalThresholdMinutes} minutes (${result.abnormalThresholdMinutes * 60}s). Server preference saved and client constants updated.`,
      });
      if (onUpdated) {
        onUpdated(result.abnormalThresholdMinutes);
      }
      setTimeout(() => {
        setStatusMessage(null);
      }, 5000);
    } else {
      setStatusMessage({
        type: 'error',
        text: result.error || 'Failed to save abnormal session threshold policy.',
      });
    }
  };

  const handlePresetClick = (presetMins: number) => {
    setThresholdMinutes(presetMins);
    handleSave(presetMins);
  };

  const handleResetDefault = () => {
    setThresholdMinutes(DEFAULT_ABNORMAL_SESSION_THRESHOLD_MINUTES);
    handleSave(DEFAULT_ABNORMAL_SESSION_THRESHOLD_MINUTES);
  };

  const thresholdSeconds = thresholdMinutes * 60;
  const thresholdMs = thresholdMinutes * 60 * 1000;

  const presets = [20, 30, 45, 60, 90, 120];

  return (
    <div
      id="admin-abnormal-session-settings-card"
      className="bg-tonal-a0 border border-surface-a10 rounded-2xl p-4 sm:p-5 space-y-4 text-xs font-mono shadow-md"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-surface-a10 pb-3">
        <div className="flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 text-warning-a0 flex-shrink-0" />
          <h4 className="text-sm font-semibold text-theme-light font-sans">
            Abnormal Session Duration Threshold Policy
          </h4>
        </div>
        <div className="flex items-center space-x-2 text-[11px]">
          <span className="text-surface-a40">Active Threshold:</span>
          <span className="px-2 py-0.5 rounded-full bg-warning-a0/20 text-warning-a0 border border-warning-a0/30 font-bold">
            &gt; {sessionConfig.abnormalThresholdMinutes} min ({sessionConfig.abnormalThresholdSeconds}s)
          </span>
          {typeof abnormalSessionsCount === 'number' && abnormalSessionsCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-danger-a0/20 text-danger-a0 border border-danger-a0/40 font-bold animate-pulse">
              {abnormalSessionsCount} Flagged
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Preset Selector */}
        <div className="space-y-2">
          <label className="text-[11px] text-surface-a40 font-bold uppercase tracking-wider block">
            Duration Threshold Presets
          </label>
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => {
              const isSelected = thresholdMinutes === p;
              return (
                <button
                  key={p}
                  type="button"
                  id={`abnormal-preset-${p}m`}
                  onClick={() => handlePresetClick(p)}
                  disabled={isSaving}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                    isSelected
                      ? 'bg-warning-a0 text-primary-a0 border-warning-a0 shadow-sm'
                      : 'bg-surface-a0 text-surface-a40 hover:text-theme-light border-surface-a10 hover:border-surface-a20'
                  }`}
                >
                  {p} min{p === 45 ? ' (Default)' : ''}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-surface-a50 mt-1">
            Sessions exceeding this limit are flagged with anomaly badges and highlighted across the audit dashboard.
          </p>
        </div>

        {/* Custom Duration Input & Save */}
        <div className="space-y-2">
          <label className="text-[11px] text-surface-a40 font-bold uppercase tracking-wider block">
            Custom Threshold (1 - 480 Minutes)
          </label>
          <div className="flex items-center space-x-2">
            <div className="relative flex items-center flex-1">
              <input
                id="abnormal-threshold-custom-input"
                type="number"
                min="1"
                max="480"
                value={thresholdMinutes}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) setThresholdMinutes(Math.max(1, Math.min(480, val)));
                }}
                disabled={isSaving}
                className="w-full bg-surface-a0 border border-surface-a10 rounded-xl px-3 py-2 text-theme-light text-xs font-mono focus:outline-none focus:border-warning-a0 pr-12"
              />
              <span className="absolute right-3 text-surface-a40 text-[11px] pointer-events-none">
                min
              </span>
            </div>

            <button
              id="abnormal-threshold-save-btn"
              type="button"
              onClick={() => handleSave()}
              disabled={isSaving || thresholdMinutes === sessionConfig.abnormalThresholdMinutes}
              className="px-4 py-2 bg-warning-a0 hover:bg-warning-a10 disabled:opacity-40 text-primary-a0 font-bold rounded-xl flex items-center space-x-1.5 transition-all text-xs"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Save</span>
                </>
              )}
            </button>

            {thresholdMinutes !== DEFAULT_ABNORMAL_SESSION_THRESHOLD_MINUTES && (
              <button
                id="abnormal-threshold-reset-btn"
                type="button"
                onClick={handleResetDefault}
                disabled={isSaving}
                title="Reset to 45m default"
                className="p-2 bg-surface-a0 hover:bg-surface-a10 border border-surface-a10 text-surface-a40 hover:text-theme-light rounded-xl transition-all"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Dynamic Telemetry Metric Mapping */}
      <div className="bg-surface-a0 border border-surface-a10 p-3 rounded-xl flex flex-wrap items-center justify-between gap-3 text-[11px] text-surface-a40">
        <div className="flex items-center space-x-2">
          <ShieldAlert className="w-3.5 h-3.5 text-warning-a0 flex-shrink-0" />
          <span>
            Client Constant: <strong className="text-theme-light">ABNORMAL_SESSION_THRESHOLD_SECONDS = {thresholdSeconds.toLocaleString()}s</strong>
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <Clock className="w-3.5 h-3.5 text-surface-a50 flex-shrink-0" />
          <span className="text-surface-a50">Threshold Milliseconds:</span>
          <strong className="text-warning-a0 font-mono">
            {thresholdMs.toLocaleString()} ms
          </strong>
        </div>
        <div className="text-[10px] text-surface-a50">
          Saved in database & applied immediately across AgentAudit dashboard highlights
        </div>
      </div>

      {/* Status Notice */}
      {statusMessage && (
        <div
          id="abnormal-threshold-status-alert"
          className={`p-3 rounded-xl border flex items-center space-x-2 text-xs transition-all ${
            statusMessage.type === 'success'
              ? 'bg-success-a0/10 border-success-a0/30 text-success-a0'
              : 'bg-danger-a0/10 border-danger-a0/30 text-danger-a0'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}
    </div>
  );
};
