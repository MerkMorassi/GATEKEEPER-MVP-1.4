import React, { useState, useEffect } from 'react';
import { Clock, Shield, Save, CheckCircle2, AlertCircle, RefreshCw, RotateCcw } from 'lucide-react';
import { sessionConfig, calculateWarningMinutes, DEFAULT_IDLE_TIMEOUT_MINUTES } from '../lib/sessionConfig';

interface AdminIdleTimeoutSettingProps {
  onUpdated?: (newMinutes: number) => void;
  compact?: boolean;
}

export const AdminIdleTimeoutSetting: React.FC<AdminIdleTimeoutSettingProps> = ({
  onUpdated,
  compact = false,
}) => {
  const [minutes, setMinutes] = useState<number>(sessionConfig.idleTimeoutMinutes);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    // Sync with sessionConfig
    setMinutes(sessionConfig.idleTimeoutMinutes);

    const unsubscribe = sessionConfig.subscribe((newMinutes) => {
      setMinutes(newMinutes);
    });

    // Also attempt to fetch latest from server on mount
    sessionConfig.fetchServerPreference().then((serverMinutes) => {
      if (serverMinutes) {
        setMinutes(serverMinutes);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleSave = async (targetMinutes?: number) => {
    const minsToSave = targetMinutes !== undefined ? targetMinutes : minutes;
    const sanitized = Math.max(1, Math.min(120, Math.round(minsToSave)));

    setIsSaving(true);
    setStatusMessage(null);

    const result = await sessionConfig.saveServerPreference(sanitized);

    setIsSaving(false);
    if (result.success) {
      setMinutes(result.idleTimeoutMinutes);
      setStatusMessage({
        type: 'success',
        text: `Idle timeout policy updated to ${result.idleTimeoutMinutes} minutes (${result.idleTimeoutMinutes * 60 * 1000} ms). Saved to server & client constant updated.`,
      });
      if (onUpdated) {
        onUpdated(result.idleTimeoutMinutes);
      }
      setTimeout(() => {
        setStatusMessage(null);
      }, 5000);
    } else {
      setStatusMessage({
        type: 'error',
        text: result.error || 'Failed to save idle timeout policy.',
      });
    }
  };

  const handlePresetClick = (presetMins: number) => {
    setMinutes(presetMins);
    handleSave(presetMins);
  };

  const handleResetDefault = () => {
    setMinutes(DEFAULT_IDLE_TIMEOUT_MINUTES);
    handleSave(DEFAULT_IDLE_TIMEOUT_MINUTES);
  };

  const warningMinutes = calculateWarningMinutes(minutes);
  const timeoutMs = minutes * 60 * 1000;
  const warningMs = Math.round(warningMinutes * 60 * 1000);

  const presets = [5, 10, 15, 30, 60];

  return (
    <div
      id="admin-idle-timeout-settings-card"
      className="bg-tonal-a0 border border-surface-a10 rounded-2xl p-4 sm:p-5 space-y-4 text-xs font-mono shadow-md"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-surface-a10 pb-3">
        <div className="flex items-center space-x-2">
          <Clock className="w-4 h-4 text-info-a0" />
          <h4 className="text-sm font-semibold text-theme-light font-sans">
            Dynamic Idle Timeout & Inactivity Policy
          </h4>
        </div>
        <div className="flex items-center space-x-2 text-[11px]">
          <span className="text-surface-a40">Active Policy:</span>
          <span className="px-2 py-0.5 rounded-full bg-info-a0/20 text-info-a0 border border-info-a0/30 font-bold">
            {sessionConfig.idleTimeoutMinutes} min lockout
          </span>
          <span className="text-surface-a50">
            ({sessionConfig.idleWarningMinutes}m warning)
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Preset Selector */}
        <div className="space-y-2">
          <label className="text-[11px] text-surface-a40 font-bold uppercase tracking-wider block">
            Quick Inactivity Presets
          </label>
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => {
              const isSelected = minutes === p;
              return (
                <button
                  key={p}
                  type="button"
                  id={`idle-preset-${p}m`}
                  onClick={() => handlePresetClick(p)}
                  disabled={isSaving}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                    isSelected
                      ? 'bg-info-a0 text-primary-a0 border-info-a0 shadow-sm'
                      : 'bg-surface-a0 text-surface-a40 hover:text-theme-light border-surface-a10 hover:border-surface-a20'
                  }`}
                >
                  {p} min{p === 15 ? ' (Default)' : ''}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-surface-a50 mt-1">
            Standard PCI-DSS & HIPAA sessions default to 15 minutes.
          </p>
        </div>

        {/* Custom Duration Input & Save */}
        <div className="space-y-2">
          <label className="text-[11px] text-surface-a40 font-bold uppercase tracking-wider block">
            Custom Duration (1 - 120 Minutes)
          </label>
          <div className="flex items-center space-x-2">
            <div className="relative flex items-center flex-1">
              <input
                id="idle-timeout-custom-input"
                type="number"
                min="1"
                max="120"
                value={minutes}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) setMinutes(Math.max(1, Math.min(120, val)));
                }}
                disabled={isSaving}
                className="w-full bg-surface-a0 border border-surface-a10 rounded-xl px-3 py-2 text-theme-light text-xs font-mono focus:outline-none focus:border-info-a0 pr-12"
              />
              <span className="absolute right-3 text-surface-a40 text-[11px] pointer-events-none">
                min
              </span>
            </div>

            <button
              id="idle-timeout-save-btn"
              type="button"
              onClick={() => handleSave()}
              disabled={isSaving || minutes === sessionConfig.idleTimeoutMinutes}
              className="px-4 py-2 bg-info-a0 hover:bg-info-a10 disabled:opacity-40 text-primary-a0 font-bold rounded-xl flex items-center space-x-1.5 transition-all text-xs"
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

            {minutes !== DEFAULT_IDLE_TIMEOUT_MINUTES && (
              <button
                id="idle-timeout-reset-btn"
                type="button"
                onClick={handleResetDefault}
                disabled={isSaving}
                title="Reset to 15m default"
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
          <Shield className="w-3.5 h-3.5 text-success-a0 flex-shrink-0" />
          <span>
            Client Constant: <strong className="text-theme-light">IDLE_TIMEOUT_MS = {timeoutMs.toLocaleString()} ms</strong>
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-surface-a50">Warning Window:</span>
          <strong className="text-info-a0 font-mono">
            {warningMinutes} min ({warningMs.toLocaleString()} ms)
          </strong>
        </div>
        <div className="text-[10px] text-surface-a50">
          Saved in database & applied immediately across all active tabs
        </div>
      </div>

      {/* Status Notice */}
      {statusMessage && (
        <div
          id="idle-timeout-status-alert"
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
