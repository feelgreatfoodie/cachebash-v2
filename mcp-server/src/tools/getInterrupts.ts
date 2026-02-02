import { getFirestore, serverTimestamp } from "../firebase/client.js";
import { AuthContext } from "../auth/apiKeyValidator.js";
import { GetInterruptsSchema } from "../validation/validators.js";
import * as admin from "firebase-admin";

/**
 * Check for interrupt messages sent from the mobile app to this session.
 * Uses transactions to atomically claim interrupts and prevent double-processing.
 */
export async function getInterrupts(
  auth: AuthContext,
  rawArgs: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const args = GetInterruptsSchema.parse(rawArgs);
  const db = getFirestore();

  // Get pending interrupts for this session
  const interruptsSnapshot = await db
    .collection(`users/${auth.userId}/sessions/${args.sessionId}/interrupts`)
    .where("status", "==", "pending")
    .orderBy("createdAt", "asc")
    .get();

  if (interruptsSnapshot.empty) {
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
    const interrupts = interruptsSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        message: data.message,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
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
      const claimedInterrupts: Array<{ id: string; message: string; createdAt: string | null }> = [];

      for (const doc of interruptsSnapshot.docs) {
        // Re-read within transaction to get latest state
        const freshDoc = await transaction.get(doc.ref);

        if (!freshDoc.exists) continue;

        const data = freshDoc.data()!;

        // Only process if still pending (another Claude may have claimed it)
        if (data.status !== "pending") {
          console.log(`[getInterrupts] Skipping interrupt ${doc.id} - already ${data.status}`);
          continue;
        }

        // Atomically mark as read
        transaction.update(doc.ref, {
          status: "read",
          readAt: admin.firestore.FieldValue.serverTimestamp(),
          claimedBy: args.sessionId,
        });

        claimedInterrupts.push({
          id: doc.id,
          message: data.message,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
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
