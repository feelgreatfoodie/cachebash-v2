import { getFirestore, serverTimestamp } from "../firebase/client.js";
import { AuthContext } from "../auth/apiKeyValidator.js";
import { GetInterruptsSchema } from "../validation/validators.js";

/**
 * Check for interrupt messages sent from the mobile app to this session.
 * Returns pending interrupts and optionally marks them as read.
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

  const interrupts = interruptsSnapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      message: data.message,
      createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
    };
  });

  // Mark as read if requested
  if (args.markAsRead !== false) {
    const batch = db.batch();
    for (const doc of interruptsSnapshot.docs) {
      batch.update(doc.ref, {
        status: "read",
        readAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }

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
