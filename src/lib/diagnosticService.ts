import { apiFetch } from './api';
import { AuditEventType } from '../types';

export interface DiagnosticSessionStats {
  sessionId: string;
  role: string;
  startedAt: number;
  sessionDurationSeconds: number;
  idleSeconds: number;
  idleWarningCount: number;
  idleTimeoutTriggered: boolean;
  isActive: boolean;
}

class DiagnosticMonitoringService {
  private sessionId: string | null = null;
  private role: string = 'guest';
  private startedAt: number = 0;
  private lastActivityAt: number = 0;
  private accumulatedIdleMs: number = 0;
  private idleWarningCount: number = 0;
  private idleWarningTriggered: boolean = false;
  private idleTimeoutTriggered: boolean = false;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private isInitialized: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      // Attach window unload listener to record SESSION_ENDED cleanly
      window.addEventListener('beforeunload', () => {
        if (this.sessionId && this.role !== 'guest') {
          this.endSession('page_unload', true);
        }
      });
    }
  }

  /**
   * Start or resume a monitored session for an authenticated user role.
   */
  public startSession(role: string, metadata?: Record<string, any>): string {
    const now = Date.now();
    
    // If switching role or already running under another session, end previous cleanly
    if (this.sessionId && this.role !== role) {
      this.endSession('role_switch');
    }

    if (!this.sessionId) {
      this.sessionId = `sess_diag_${now}_${Math.random().toString(36).substring(2, 8)}`;
      this.role = role;
      this.startedAt = now;
      this.lastActivityAt = now;
      this.accumulatedIdleMs = 0;
      this.idleWarningCount = 0;
      this.idleWarningTriggered = false;
      this.idleTimeoutTriggered = false;
      this.isInitialized = true;

      // Log SESSION_STARTED audit event
      this.sendDiagnosticEvent('SESSION_STARTED', {
        sessionId: this.sessionId,
        role: this.role,
        sessionDurationSeconds: 0,
        idleSeconds: 0,
        screenResolution: typeof window !== 'undefined' ? `${window.screen.width}x${window.screen.height}` : 'unknown',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        reason: 'User session initialized',
        metadata: metadata || {},
      });

      // Start periodic heartbeat every 60 seconds
      if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = setInterval(() => {
        this.emitHeartbeat();
      }, 60000);
    }

    return this.sessionId;
  }

  /**
   * Notify diagnostic service of user activity (mouse, keyboard, touch, scroll).
   */
  public recordActivity(): void {
    if (!this.sessionId) return;
    this.lastActivityAt = Date.now();
    this.idleWarningTriggered = false;
  }

  /**
   * Record an idle warning event when user passes threshold (e.g., 10 minutes).
   */
  public recordIdleWarning(idleSeconds: number): void {
    if (!this.sessionId || this.idleWarningTriggered) return;
    this.idleWarningTriggered = true;
    this.idleWarningCount += 1;

    const sessionDurationSeconds = Math.floor((Date.now() - this.startedAt) / 1000);

    this.sendDiagnosticEvent('SESSION_IDLE_WARNING', {
      sessionId: this.sessionId,
      role: this.role,
      sessionDurationSeconds,
      idleSeconds,
      warningCount: this.idleWarningCount,
      reason: `User inactivity exceeded warning threshold (${idleSeconds}s idle)`,
    });
  }

  /**
   * Record an idle timeout event when user reaches termination threshold (e.g. 15 minutes).
   */
  public recordIdleTimeout(idleSeconds: number): void {
    if (!this.sessionId || this.idleTimeoutTriggered) return;
    this.idleTimeoutTriggered = true;

    const sessionDurationSeconds = Math.floor((Date.now() - this.startedAt) / 1000);

    this.sendDiagnosticEvent('SESSION_IDLE_TIMEOUT', {
      sessionId: this.sessionId,
      role: this.role,
      sessionDurationSeconds,
      idleSeconds,
      reason: `Session idle timeout triggered (${idleSeconds}s without activity). Auto-logging out.`,
    });
  }

  /**
   * Periodic session heartbeat to record cumulative session duration.
   */
  private emitHeartbeat(): void {
    if (!this.sessionId) return;
    const now = Date.now();
    const sessionDurationSeconds = Math.floor((now - this.startedAt) / 1000);
    const idleSeconds = Math.floor((now - this.lastActivityAt) / 1000);

    this.sendDiagnosticEvent('SESSION_HEARTBEAT', {
      sessionId: this.sessionId,
      role: this.role,
      sessionDurationSeconds,
      idleSeconds,
      reason: 'Diagnostic session active heartbeat',
    });
  }

  /**
   * End session and dispatch termination diagnostics.
   */
  public endSession(reason: string = 'user_logout', useBeacon: boolean = false): void {
    if (!this.sessionId) return;

    const now = Date.now();
    const sessionDurationSeconds = Math.floor((now - this.startedAt) / 1000);
    const idleSeconds = Math.floor((now - this.lastActivityAt) / 1000);

    const payload = {
      sessionId: this.sessionId,
      role: this.role,
      sessionDurationSeconds,
      idleSeconds,
      idleWarningCount: this.idleWarningCount,
      timeoutTriggered: this.idleTimeoutTriggered,
      reason,
      endedAt: new Date(now).toISOString(),
    };

    if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      try {
        const blob = new Blob([JSON.stringify({ eventType: 'SESSION_ENDED', ...payload })], {
          type: 'application/json',
        });
        navigator.sendBeacon('/api/diagnostics/session-event', blob);
      } catch (_) {
        this.sendDiagnosticEvent('SESSION_ENDED', payload);
      }
    } else {
      this.sendDiagnosticEvent('SESSION_ENDED', payload);
    }

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    this.sessionId = null;
    this.role = 'guest';
    this.isInitialized = false;
  }

  /**
   * Safe transmission of diagnostic audit events to the backend.
   */
  private async sendDiagnosticEvent(eventType: AuditEventType, details: Record<string, any>): Promise<void> {
    try {
      await apiFetch('/api/diagnostics/session-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: this.sessionId || details.sessionId,
          eventType,
          operator: this.role || 'client',
          details,
        }),
      });
    } catch (err) {
      // Diagnostic telemetry must never crash the frontend
      console.warn('[Diagnostic Service] Failed to send telemetry event:', eventType, err);
    }
  }

  /**
   * Get current diagnostic session snapshot for real-time monitoring and HUDs.
   */
  public getSessionStats(): DiagnosticSessionStats | null {
    if (!this.sessionId) return null;
    const now = Date.now();
    return {
      sessionId: this.sessionId,
      role: this.role,
      startedAt: this.startedAt,
      sessionDurationSeconds: Math.floor((now - this.startedAt) / 1000),
      idleSeconds: Math.floor((now - this.lastActivityAt) / 1000),
      idleWarningCount: this.idleWarningCount,
      idleTimeoutTriggered: this.idleTimeoutTriggered,
      isActive: true,
    };
  }
}

export const diagnosticService = new DiagnosticMonitoringService();
