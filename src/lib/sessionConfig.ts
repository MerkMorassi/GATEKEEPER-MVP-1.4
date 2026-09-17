import { apiFetch } from './api';

export const DEFAULT_IDLE_TIMEOUT_MINUTES = 15;
export const DEFAULT_ABNORMAL_SESSION_THRESHOLD_MINUTES = 45;

/**
 * Calculates the recommended warning threshold based on total timeout duration.
 * E.g., for 15 mins -> 10 mins warning (5 min warning window)
 * For 5 mins -> 3 mins warning (2 min warning window)
 * For 2 mins or less -> 50% of the timeout
 */
export function calculateWarningMinutes(timeoutMinutes: number): number {
  if (timeoutMinutes <= 2) {
    return Math.max(0.5, Number((timeoutMinutes * 0.5).toFixed(1)));
  }
  const windowMinutes = Math.min(5, Math.max(1, Math.round(timeoutMinutes * 0.33)));
  return Math.max(1, timeoutMinutes - windowMinutes);
}

class SessionConfigManager {
  private _idleTimeoutMinutes: number = DEFAULT_IDLE_TIMEOUT_MINUTES;
  private _abnormalThresholdMinutes: number = DEFAULT_ABNORMAL_SESSION_THRESHOLD_MINUTES;
  private listeners: Set<(timeoutMinutes: number, abnormalThresholdMinutes: number) => void> = new Set();
  private isLoadedFromServer: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const cachedTimeout = localStorage.getItem('gatekeeper_idle_timeout_mins');
      if (cachedTimeout) {
        const val = parseInt(cachedTimeout, 10);
        if (!isNaN(val) && val >= 1 && val <= 120) {
          this._idleTimeoutMinutes = val;
        }
      }
      const cachedAbnormal = localStorage.getItem('gatekeeper_abnormal_session_threshold_mins');
      if (cachedAbnormal) {
        const val = parseInt(cachedAbnormal, 10);
        if (!isNaN(val) && val >= 1 && val <= 480) {
          this._abnormalThresholdMinutes = val;
        }
      }
    }
  }

  public get idleTimeoutMinutes(): number {
    return this._idleTimeoutMinutes;
  }

  public get abnormalThresholdMinutes(): number {
    return this._abnormalThresholdMinutes;
  }

  public get idleWarningMinutes(): number {
    return calculateWarningMinutes(this._idleTimeoutMinutes);
  }

  public get idleTimeoutMs(): number {
    return this._idleTimeoutMinutes * 60 * 1000;
  }

  public get idleWarningMs(): number {
    return Math.round(this.idleWarningMinutes * 60 * 1000);
  }

  public get abnormalThresholdMs(): number {
    return this._abnormalThresholdMinutes * 60 * 1000;
  }

  public get abnormalThresholdSeconds(): number {
    return this._abnormalThresholdMinutes * 60;
  }

  /**
   * Dynamically updates the idle timeout client-side constant and notifies all listeners.
   */
  public setIdleTimeoutMinutes(minutes: number, persistLocal: boolean = true): void {
    const sanitized = Math.max(1, Math.min(120, Math.round(minutes)));
    if (isNaN(sanitized)) return;

    this._idleTimeoutMinutes = sanitized;

    if (persistLocal && typeof window !== 'undefined') {
      try {
        localStorage.setItem('gatekeeper_idle_timeout_mins', sanitized.toString());
        window.dispatchEvent(
          new CustomEvent('idle-timeout-updated', {
            detail: {
              idleTimeoutMinutes: sanitized,
              idleTimeoutMs: sanitized * 60 * 1000,
              idleWarningMs: this.idleWarningMs,
            },
          })
        );
      } catch (_) {}
    }

    // Update the exported client-side variables
    updateClientConstants(this);
    this.notifySubscribers();
  }

  /**
   * Dynamically updates the abnormal session duration threshold client-side constant.
   */
  public setAbnormalThresholdMinutes(minutes: number, persistLocal: boolean = true): void {
    const sanitized = Math.max(1, Math.min(480, Math.round(minutes)));
    if (isNaN(sanitized)) return;

    this._abnormalThresholdMinutes = sanitized;

    if (persistLocal && typeof window !== 'undefined') {
      try {
        localStorage.setItem('gatekeeper_abnormal_session_threshold_mins', sanitized.toString());
        window.dispatchEvent(
          new CustomEvent('abnormal-threshold-updated', {
            detail: {
              abnormalThresholdMinutes: sanitized,
              abnormalThresholdMs: sanitized * 60 * 1000,
              abnormalThresholdSeconds: sanitized * 60,
            },
          })
        );
      } catch (_) {}
    }

    // Update the exported client-side variables
    updateClientConstants(this);
    this.notifySubscribers();
  }

  private notifySubscribers() {
    this.listeners.forEach((listener) => {
      try {
        listener(this._idleTimeoutMinutes, this._abnormalThresholdMinutes);
      } catch (err) {
        console.error('Error in session config listener:', err);
      }
    });
  }

  /**
   * Fetches session policy preferences (idle timeout and abnormal session threshold) from backend.
   */
  public async fetchServerPreference(): Promise<{ idleTimeoutMinutes: number; abnormalThresholdMinutes: number }> {
    try {
      const res = await apiFetch('/api/admin/session-thresholds');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) throw new Error('Not JSON');
      
      const data = await res.json();
      if (data && data.success) {
        if (typeof data.idleTimeoutMinutes === 'number') {
          this.setIdleTimeoutMinutes(data.idleTimeoutMinutes, true);
        }
        if (typeof data.abnormalSessionThresholdMinutes === 'number') {
          this.setAbnormalThresholdMinutes(data.abnormalSessionThresholdMinutes, true);
        }
        this.isLoadedFromServer = true;
      }
    } catch (_) {
      // Fallback: try individual endpoint
      try {
        const res2 = await apiFetch('/api/admin/idle-timeout');
        if (!res2.ok) throw new Error(`HTTP ${res2.status}`);
        const contentType2 = res2.headers.get('content-type');
        if (!contentType2 || !contentType2.includes('application/json')) throw new Error('Not JSON');

        const data2 = await res2.json();
        if (data2 && data2.success) {
          if (typeof data2.idleTimeoutMinutes === 'number') {
            this.setIdleTimeoutMinutes(data2.idleTimeoutMinutes, true);
          }
          if (typeof data2.abnormalSessionThresholdMinutes === 'number') {
            this.setAbnormalThresholdMinutes(data2.abnormalSessionThresholdMinutes, true);
          }
        }
      } catch (_) {}
    }
    return {
      idleTimeoutMinutes: this._idleTimeoutMinutes,
      abnormalThresholdMinutes: this._abnormalThresholdMinutes,
    };
  }

  /**
   * Persists the idle timeout preference to the server.
   */
  public async saveServerPreference(minutes: number): Promise<{ success: boolean; idleTimeoutMinutes: number; error?: string }> {
    const sanitized = Math.max(1, Math.min(120, Math.round(minutes)));
    try {
      const res = await apiFetch('/api/admin/idle-timeout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idleTimeoutMinutes: sanitized }),
      });
      const data = await res.json();

      if (data && data.success) {
        this.setIdleTimeoutMinutes(sanitized, true);
        return { success: true, idleTimeoutMinutes: sanitized };
      } else {
        return { success: false, idleTimeoutMinutes: this._idleTimeoutMinutes, error: data?.error || 'Failed to save preference' };
      }
    } catch (err: any) {
      return { success: false, idleTimeoutMinutes: this._idleTimeoutMinutes, error: err.message || 'Network error saving preference' };
    }
  }

  /**
   * Persists the abnormal session duration threshold preference to the server.
   */
  public async saveAbnormalThreshold(minutes: number): Promise<{ success: boolean; abnormalThresholdMinutes: number; error?: string }> {
    const sanitized = Math.max(1, Math.min(480, Math.round(minutes)));
    try {
      const res = await apiFetch('/api/admin/abnormal-session-threshold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ abnormalSessionThresholdMinutes: sanitized }),
      });
      const data = await res.json();

      if (data && data.success) {
        this.setAbnormalThresholdMinutes(sanitized, true);
        return { success: true, abnormalThresholdMinutes: sanitized };
      } else {
        return { success: false, abnormalThresholdMinutes: this._abnormalThresholdMinutes, error: data?.error || 'Failed to save threshold' };
      }
    } catch (err: any) {
      return { success: false, abnormalThresholdMinutes: this._abnormalThresholdMinutes, error: err.message || 'Network error saving threshold' };
    }
  }

  public subscribe(listener: (timeoutMinutes: number, abnormalThresholdMinutes: number) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const sessionConfig = new SessionConfigManager();

// Dynamic client-side constants (updated whenever admin reconfigures thresholds)
export let IDLE_TIMEOUT_MINUTES: number = sessionConfig.idleTimeoutMinutes;
export let IDLE_TIMEOUT_MS: number = sessionConfig.idleTimeoutMs;
export let IDLE_WARNING_MS: number = sessionConfig.idleWarningMs;
export let ABNORMAL_SESSION_THRESHOLD_MINUTES: number = sessionConfig.abnormalThresholdMinutes;
export let ABNORMAL_SESSION_THRESHOLD_MS: number = sessionConfig.abnormalThresholdMs;
export let ABNORMAL_SESSION_THRESHOLD_SECONDS: number = sessionConfig.abnormalThresholdSeconds;

function updateClientConstants(manager: SessionConfigManager) {
  IDLE_TIMEOUT_MINUTES = manager.idleTimeoutMinutes;
  IDLE_TIMEOUT_MS = manager.idleTimeoutMs;
  IDLE_WARNING_MS = manager.idleWarningMs;
  ABNORMAL_SESSION_THRESHOLD_MINUTES = manager.abnormalThresholdMinutes;
  ABNORMAL_SESSION_THRESHOLD_MS = manager.abnormalThresholdMs;
  ABNORMAL_SESSION_THRESHOLD_SECONDS = manager.abnormalThresholdSeconds;
}

export function isAbnormalSessionDuration(durationSeconds: number): boolean {
  return durationSeconds >= sessionConfig.abnormalThresholdSeconds;
}
