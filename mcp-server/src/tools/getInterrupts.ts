import { getFirestore, serverTimestamp } from "../firebase/client.js";
import { AuthContext } from "../auth/apiKeyValidator.js";
import { GetInterruptsSchema } from "../validation/validators.js";
import * as admin from "firebase-admin";

/**
 * Check for interrupt messages sent from the mobile app to this session.
 * Reads from /messages collection with direction: to_claude.
 * Uses transactions to atomically claim interrupts and prevent double-processing.
 */
export async function getInterrupts(
  auth: AuthContext,
  rawArgs: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const args = GetInterruptsSchema.parse(rawArgs);
  const db = getFirestore();

  // Build query for pending messages directed to Claude
  const query = db
    .collection(`users/${auth.userId}/messages`)
    .where("direction", "==", "to_claude")
    .where("status", "==", "pending")
    .orderBy("createdAt", "asc");

  // Note: we filter by `target` (routing) in memory, not by `sessionId` (claiming).
  // Firestore can't do OR queries on missing fields, so fetch all and filter.
  const interruptsSnapshot = await query.get();

  // Filter by target: only return messages routed to this session or with no target
  const filteredDocs = args.sessionId
    ? interruptsSnapshot.docs.filter((doc) => {
        const target = doc.data().target;
        return !target || target === args.sessionId;
      })
    : interruptsSnapshot.docs;

  if (filteredDocs.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            hasInterrupts: false,
            interrupts: [],
            message: "No pending interrupts",
          }),
        },
      ],
    };
  }

  // If not marking as read, just return the data
  if (args.markAsRead === false) {
    const interrupts = filteredDocs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        message: data.content, // /messages uses 'content' field
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        action: data.action,
        priority: data.priority,
      };
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            hasInterrupts: true,
            interrupts,
            message: `${interrupts.length} interrupt(s) from user`,
          }),
        },
      ],
    };
  }

  // Use transaction to atomically claim and mark interrupts as read
  // This prevents two Claude instances from processing the same interrupt
  try {
    const result = await db.runTransaction(async (transaction) => {
      const claimedInterrupts: Array<{
        id: string;
        message: string;
        createdAt: string | null;
        action?: string;
        priority?: string;
      }> = [];

      for (const doc of filteredDocs) {
        // Re-read within transaction to get latest state
        const freshDoc = await transaction.get(doc.ref);

        if (!freshDoc.exists) continue;

        const data = freshDoc.data()!;

        // Only process if still pending (another Claude may have claimed it)
        if (data.status !== "pending") {
          console.log(`[getInterrupts] Skipping interrupt ${doc.id} - already ${data.status}`);
          continue;
        }

        // Atomically mark as in_progress (matches /messages schema)
        transaction.update(doc.ref, {
          status: "in_progress",
          startedAt: admin.firestore.FieldValue.serverTimestamp(),
          sessionId: args.sessionId || doc.data()?.sessionId,
        });

        claimedInterrupts.push({
          id: doc.id,
          message: data.content, // /messages uses 'content' field
          createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
          action: data.action,
          priority: data.priority,
        });
      }

      return claimedInterrupts;
    });

    if (result.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              hasInterrupts: false,
              interrupts: [],
              message: "No pending interrupts (all claimed by another session)",
            }),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            hasInterrupts: true,
            interrupts: result,
            message: `${result.length} interrupt(s) from user`,
          }),
        },
      ],
    };
  } catch (error) {
    console.error("[getInterrupts] Transaction failed:", error);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            error: `Failed to claim interrupts: ${error instanceof Error ? error.message : String(error)}`,
          }),
        },
      ],
    };
  }
}
