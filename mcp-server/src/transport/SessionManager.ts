/**
 * Session Manager
 *
 * Manages MCP session lifecycle with timeout-based cleanup.
 *
 * Session flow:
 * 1. Client sends "initialize" message with auth
 * 2. createSession() generates a unique session ID
 * 3. Session stored in memory with auth context and timestamps
 * 4. Client includes Mcp-Session-Id header in subsequent requests
 * 5. validateSession() checks existence and timeout
 * 6. Session expires after 30min of inactivity (no requests)
 * 7. Background cleanup job removes expired sessions every 5 minutes
 *
 * Why in-memory storage:
 * - Sessions are ephemeral, don't need persistence
 * - Fast lookups (O(1) Map access)
 * - Auto-cleanup on server restart is actually desirable (forces re-auth)
 *
 * Timeout tradeoff:
 * - Too short: agents reconnect constantly, auth overhead
 * - Too long: memory leak if agents crash without closing sessions
 * - 30min is a balance: tolerates network hiccups, cleanup stale sessions quickly
 */

import crypto from "crypto";
import { AuthContext } from "../auth/apiKeyValidator.js";
import { SessionInfo } from "./types.js";

export class SessionManager {
  private sessions: Map<string, SessionInfo> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor(private timeoutMs: number) {
    // Start cleanup job
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Create a new session
   */
  createSession(authContext: AuthContext): string {
    const sessionId = crypto.randomUUID();
    const now = new Date();

    this.sessions.set(sessionId, {
      sessionId,
      userId: authContext.userId,
      authContext,
      createdAt: now,
      lastActivity: now,
    });

    return sessionId;
  }

  /**
   * Validate and refresh a session
   * Returns true if valid, false if expired or not found
   */
  validateSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    const now = new Date();
    const elapsed = now.getTime() - session.lastActivity.getTime();

    if (elapsed > this.timeoutMs) {
      this.sessions.delete(sessionId);
      return false;
    }

    // Refresh last activity
    session.lastActivity = now;
    return true;
  }

  /**
   * Get session info
   */
  getSession(sessionId: string): SessionInfo | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Delete a session
   */
  deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /**
   * Cleanup expired sessions
   */
  private cleanup(): void {
    const now = new Date();
    const expired: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      const elapsed = now.getTime() - session.lastActivity.getTime();
      if (elapsed > this.timeoutMs) {
        expired.push(sessionId);
      }
    }

    for (const sessionId of expired) {
      this.sessions.delete(sessionId);
    }

    if (expired.length > 0) {
      console.log(`Cleaned up ${expired.length} expired sessions`);
    }
  }

  /**
   * Stop cleanup job
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
  }
}
