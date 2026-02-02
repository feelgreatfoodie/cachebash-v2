/**
 * Session management for CustomHTTPTransport
 *
 * Uses Firestore for session storage since Cloud Run scales to zero.
 * Sessions are stored at: users/{userId}/mcp_sessions/{sessionId}
 */

import { getFirestore } from '../firebase/client.js';
import { SessionInfo, SessionValidation } from './types.js';
import { randomBytes } from 'crypto';

const SESSION_TIMEOUT = 60 * 60 * 1000; // 60 minutes

/**
 * Generate a secure session ID
 */
function generateSessionId(): string {
  return randomBytes(16).toString('hex');
}

/**
 * SessionManager handles session lifecycle in Firestore
 */
export class SessionManager {
  private sessionTimeout: number;

  constructor(sessionTimeout: number = SESSION_TIMEOUT) {
    this.sessionTimeout = sessionTimeout;
  }

  /**
   * Create a new session in Firestore
   */
  async createSession(
    userId: string,
    authContext?: { apiKey: string; userId: string }
  ): Promise<SessionInfo> {
    const sessionId = generateSessionId();
    const now = Date.now();

    const session: SessionInfo = {
      sessionId,
      userId,
      authContext,
      lastActivity: now,
      createdAt: now,
    };

    const db = getFirestore();
    const sessionRef = db.collection('users').doc(userId).collection('mcp_sessions').doc(sessionId);

    await sessionRef.set({
      sessionId,
      userId,
      ...(authContext && { authContext }),
      lastActivity: now,
      createdAt: now,
    });

    console.log(`[SessionManager] Created session ${sessionId} for user ${userId}`);

    return session;
  }

  /**
   * Get a session from Firestore
   */
  async getSession(sessionId: string, userId: string): Promise<SessionInfo | null> {
    const db = getFirestore();
    const sessionRef = db.collection('users').doc(userId).collection('mcp_sessions').doc(sessionId);

    const doc = await sessionRef.get();
    if (!doc.exists) {
      return null;
    }

    const data = doc.data();
    if (!data) {
      return null;
    }

    return {
      sessionId: data.sessionId,
      userId: data.userId,
      authContext: data.authContext,
      lastActivity: data.lastActivity,
      protocolVersion: data.protocolVersion,
      createdAt: data.createdAt,
    };
  }

  /**
   * Update session activity timestamp
   */
  async updateActivity(sessionId: string, userId: string): Promise<void> {
    const db = getFirestore();
    const sessionRef = db.collection('users').doc(userId).collection('mcp_sessions').doc(sessionId);

    await sessionRef.update({
      lastActivity: Date.now(),
    });
  }

  /**
   * Set protocol version for a session
   */
  async setProtocolVersion(sessionId: string, userId: string, version: string): Promise<void> {
    const db = getFirestore();
    const sessionRef = db.collection('users').doc(userId).collection('mcp_sessions').doc(sessionId);

    await sessionRef.update({
      protocolVersion: version,
    });
  }

  /**
   * Delete a session from Firestore
   */
  async deleteSession(sessionId: string, userId: string): Promise<void> {
    const db = getFirestore();
    const sessionRef = db.collection('users').doc(userId).collection('mcp_sessions').doc(sessionId);

    await sessionRef.delete();
    console.log(`[SessionManager] Deleted session ${sessionId}`);
  }

  /**
   * Validate a session (exists and not expired)
   */
  async validateSession(sessionId: string, userId: string): Promise<SessionValidation> {
    const session = await this.getSession(sessionId, userId);

    if (!session) {
      return {
        valid: false,
        error: 'Session not found',
      };
    }

    // Check if session has expired
    const now = Date.now();
    const age = now - session.lastActivity;

    if (age > this.sessionTimeout) {
      // Session expired, delete it
      await this.deleteSession(sessionId, userId);
      return {
        valid: false,
        error: 'Session expired',
      };
    }

    // Update activity timestamp
    await this.updateActivity(sessionId, userId);

    return {
      valid: true,
      session,
    };
  }

  /**
   * Cleanup expired sessions for a user
   * Called periodically by Cloud Function
   */
  async cleanupExpiredSessions(userId: string): Promise<number> {
    const db = getFirestore();
    const sessionsRef = db.collection('users').doc(userId).collection('mcp_sessions');

    const now = Date.now();
    const expiryThreshold = now - this.sessionTimeout;

    const snapshot = await sessionsRef.where('lastActivity', '<', expiryThreshold).get();

    if (snapshot.empty) {
      return 0;
    }

    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    console.log(`[SessionManager] Cleaned up ${snapshot.size} expired sessions for user ${userId}`);
    return snapshot.size;
  }

  /**
   * Get all active sessions for a user (for debugging)
   */
  async getActiveSessions(userId: string): Promise<SessionInfo[]> {
    const db = getFirestore();
    const sessionsRef = db.collection('users').doc(userId).collection('mcp_sessions');

    const now = Date.now();
    const expiryThreshold = now - this.sessionTimeout;

    const snapshot = await sessionsRef.where('lastActivity', '>', expiryThreshold).get();

    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        sessionId: data.sessionId,
        userId: data.userId,
        authContext: data.authContext,
        lastActivity: data.lastActivity,
        protocolVersion: data.protocolVersion,
        createdAt: data.createdAt,
      };
    });
  }
}
