import { getFirestore, serverTimestamp } from "../firebase/client.js";
import { AuthContext } from "../auth/apiKeyValidator.js";
import { SendAlertSchema } from "../validation/validators.js";

/**
 * Send an alert notification to the user's mobile device.
 * Alerts are one-way messages that don't require a response.
 *
 * Unlike questions, alerts just notify the user of events like:
 * - Build failures/successes
 * - Task completions
 * - Errors encountered
 * - Status updates
 */
export async function sendAlert(
  auth: AuthContext,
  rawArgs: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  // Validate input
  const args = SendAlertSchema.parse(rawArgs);
  const db = getFirestore();

  // Create plaintext preview for notification display (50 chars max)
  const preview = args.message.length > 50
    ? args.message.substring(0, 47) + "..."
    : args.message;

  // Prepare alert data
  const alertData: Record<string, unknown> = {
    direction: "to_user",
    messageType: "alert",
    alertType: args.alertType || "info",
    content: args.message,
    preview,
    priority: args.priority || "normal",
    status: "pending", // Alerts start as pending, can be "acknowledged" when user taps
    context: args.context || null,
    sessionId: args.sessionId || null,
    createdAt: serverTimestamp(),
    archived: false,
    deletedAt: null,
    encrypted: false, // Alerts are not encrypted by default (they're status updates)
  };

  // Create alert in unified messages collection
  const alertRef = await db
    .collection(`users/${auth.userId}/messages`)
    .add(alertData);

  const alertId = alertRef.id;

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          alertId,
          alertType: args.alertType || "info",
          message: `Alert sent to user's device. Alert ID: "${alertId}"`,
        }),
      },
    ],
  };
}
