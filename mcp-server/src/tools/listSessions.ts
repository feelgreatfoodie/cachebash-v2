import { getFirestore } from "../firebase/client.js";
import { AuthContext } from "../auth/apiKeyValidator.js";
import { z } from "zod";

const ListSessionsSchema = z.object({
  state: z.enum(["working", "blocked", "pinned", "complete", "all"]).optional(),
  limit: z.number().min(1).max(50).optional(),
  includeArchived: z.boolean().optional(),
});

/**
 * List sessions for the authenticated user
 */
export async function listSessions(
  auth: AuthContext,
  rawArgs: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const args = ListSessionsSchema.parse(rawArgs);
  const db = getFirestore();

  let query = db.collection(`users/${auth.userId}/sessions`);

  // Filter by state if specified
  if (args.state && args.state !== "all") {
    query = query.where("state", "==", args.state) as any;
  }

  // Filter out archived unless explicitly requested
  if (!args.includeArchived) {
    query = query.where("archived", "==", false) as any;
  }

  // Order by most recent
  query = query.orderBy("lastUpdate", "desc") as any;

  // Apply limit
  const limit = args.limit || 10;
  query = query.limit(limit) as any;

  const snapshot = await query.get();

  const sessions = snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      sessionId: doc.id,
      name: data.name,
      status: data.status,
      state: data.state,
      progress: data.progress,
      projectName: data.projectName,
      lastUpdate: data.lastUpdate?.toDate?.()?.toISOString() || null,
      archived: data.archived || false,
    };
  });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          count: sessions.length,
          sessions,
        }, null, 2),
      },
    ],
  };
}
