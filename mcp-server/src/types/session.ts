/**
 * Session Type Definitions
 *
 * Sessions track agent work progress and health. Every agent creates a session when it
 * starts working, updates it as work progresses, and marks it complete when done.
 *
 * Session states:
 * - "working": actively processing tasks
 * - "blocked": waiting on external dependency (human input, API, another agent)
 * - "complete": work finished, session can be archived
 * - "pinned": paused but keeping context warm (like a browser tab you'll return to)
 *
 * Heartbeat mechanism:
 * - Agents call update_session({ lastHeartbeat: true }) every 10-15 minutes
 * - If heartbeat stops, coordinator knows the agent crashed or stalled
 * - Stale sessions (no heartbeat for 30+ min) trigger alerts and task reassignment
 *
 * Progress tracking:
 * - 0-100 scale, updated by agent as work advances
 * - Helps coordinators estimate completion time and load balance
 * - Also useful for observability dashboards showing agent health
 */

export type SessionState = "working" | "blocked" | "complete" | "pinned";

export interface Session {
  sessionId: string;
  name: string;
  agentId: string;
  userId: string;
  state: SessionState;
  status: string; // Free-form status message, e.g., "Processing task 3 of 10"
  progress: number; // 0-100

  // Project context
  projectName?: string;
  projectId?: string;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  lastHeartbeat: Date;
  completedAt?: Date;
  archivedAt?: Date;
}
