/**
 * Session Management Module
 *
 * Sessions track agent work progress and health. Every agent creates a session when starting
 * work and updates it as progress advances.
 *
 * Heartbeat mechanism:
 * - Agents call update_session({ lastHeartbeat: true }) every 10-15 minutes
 * - Coordinators monitor lastHeartbeat timestamps to detect stalled agents
 * - Stale sessions (no heartbeat for 30+ min) trigger alerts
 *
 * Session lifecycle:
 * - create_session: agent starts work, state = "working"
 * - update_session: progress updates, heartbeats, status messages
 * - Agent completes work: update_session({ state: "complete" })
 * - Background job archives complete sessions after 7 days
 *
 * Why separate sessions from tasks:
 * - Tasks are work units, sessions are execution context
 * - One session can process many tasks
 * - Sessions track agent health, tasks track work completion
 */

import { z } from "zod";
import { getFirestore, serverTimestamp } from "../firebase/client.js";
import { AuthContext } from "../auth/apiKeyValidator.js";
import { Session, SessionState } from "../types/session.js";

const db = getFirestore();

// Zod validation schemas
const CreateSessionSchema = z.object({
  name: z.string().max(200),
  sessionId: z.string().max(100).optional(),
  agentId: z.string().max(50).optional(),
  state: z.enum(["working", "blocked", "complete", "pinned"]).optional().default("working"),
  status: z.string().max(200).optional(),
  progress: z.number().min(0).max(100).optional().default(0),
  projectName: z.string().max(100).optional(),
});

const UpdateSessionSchema = z.object({
  status: z.string().max(200),
  sessionId: z.string().optional(),
  state: z.enum(["working", "blocked", "complete", "pinned"]).optional(),
  progress: z.number().min(0).max(100).optional(),
  projectName: z.string().max(100).optional(),
  lastHeartbeat: z.boolean().optional(),
});

const ListSessionsSchema = z.object({
  state: z.enum(["working", "blocked", "pinned", "complete", "all"]).optional().default("all"),
  agentId: z.string().max(50).optional(),
  includeArchived: z.boolean().optional().default(false),
  limit: z.number().min(1).max(50).optional().default(10),
});

/**
 * Create session handler (upsert if sessionId provided)
 */
export async function createSessionHandler(auth: AuthContext, args: any) {
  const params = CreateSessionSchema.parse(args);

  const sessionId = params.sessionId || db.collection("users").doc(auth.userId).collection("sessions").doc().id;
  const now = new Date();

  const session: Partial<Session> = {
    sessionId,
    name: params.name,
    agentId: params.agentId || auth.agentId,
    userId: auth.userId,
    state: params.state as SessionState,
    status: params.status || "Session started",
    progress: params.progress,
    projectName: params.projectName,
    createdAt: now,
    updatedAt: now,
    lastHeartbeat: now,
  };

  await db
    .collection("users")
    .doc(auth.userId)
    .collection("sessions")
    .doc(sessionId)
    .set(session, { merge: true }); // Merge for upsert behavior

  return {
    content: [{ type: "text", text: JSON.stringify({ session, created: true }) }],
  };
}

/**
 * Update session handler
 */
export async function updateSessionHandler(auth: AuthContext, args: any) {
  const params = UpdateSessionSchema.parse(args);

  // Find session by ID or use most recent active session
  let sessionRef;
  if (params.sessionId) {
    sessionRef = db
      .collection("users")
      .doc(auth.userId)
      .collection("sessions")
      .doc(params.sessionId);
  } else {
    // Find most recent active session for this agent
    const snapshot = await db
      .collection("users")
      .doc(auth.userId)
      .collection("sessions")
      .where("agentId", "==", auth.agentId)
      .where("state", "in", ["working", "blocked", "pinned"])
      .orderBy("lastHeartbeat", "desc")
      .limit(1)
      .get();

    if (snapshot.empty) {
      throw new Error("No active session found");
    }

    sessionRef = snapshot.docs[0].ref;
  }

  const updates: any = {
    status: params.status,
    updatedAt: serverTimestamp(),
  };

  if (params.state) {
    updates.state = params.state;
  }

  if (params.progress !== undefined) {
    updates.progress = params.progress;
  }

  if (params.projectName) {
    updates.projectName = params.projectName;
  }

  if (params.lastHeartbeat) {
    updates.lastHeartbeat = serverTimestamp();
  }

  // Handle completion
  if (params.state === "complete" && !updates.completedAt) {
    updates.completedAt = serverTimestamp();
  }

  await sessionRef.update(updates);

  return {
    content: [{ type: "text", text: JSON.stringify({ updated: true, sessionId: sessionRef.id }) }],
  };
}

/**
 * List sessions handler
 */
export async function listSessionsHandler(auth: AuthContext, args: any) {
  const params = ListSessionsSchema.parse(args);

  let query = db
    .collection("users")
    .doc(auth.userId)
    .collection("sessions")
    .orderBy("lastHeartbeat", "desc")
    .limit(params.limit);

  // Filter by state
  if (params.state !== "all") {
    query = query.where("state", "==", params.state) as any;
  }

  // Filter by agent
  if (params.agentId) {
    query = query.where("agentId", "==", params.agentId) as any;
  }

  // Filter archived
  if (!params.includeArchived) {
    query = query.where("archivedAt", "==", null) as any;
  }

  const snapshot = await query.get();
  const sessions = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Session));

  return {
    content: [{ type: "text", text: JSON.stringify({ sessions, count: sessions.length }) }],
  };
}
