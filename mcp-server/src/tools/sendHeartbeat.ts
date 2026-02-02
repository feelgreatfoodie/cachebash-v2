import { getFirestore, serverTimestamp } from "../firebase/client.js";
import { AuthContext } from "../auth/apiKeyValidator.js";
import { SendHeartbeatSchema } from "../validation/validators.js";

/**
 * Send a heartbeat for a task being worked on.
 * This prevents the task from being marked as orphaned by the cleanup function.
 *
 * The cleanup function (cleanupOrphanedTasks) reverts tasks with lastHeartbeat > 30 minutes.
 * Call this every 10-15 minutes during long-running tasks.
 *
 * Optionally update status and progress along with the heartbeat.
 */
export async function sendHeartbeat(
  auth: AuthContext,
  rawArgs: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  // Validate input
  const args = SendHeartbeatSchema.parse(rawArgs);
  const db = getFirestore();

  // Build update object
  const updates: Record<string, unknown> = {
    lastHeartbeat: serverTimestamp(),
  };

  if (args.status) {
    updates.currentStatus = args.status;
  }

  if (args.progress !== undefined) {
    updates.progress = args.progress;
  }

  // Update the task document
  const taskRef = db.doc(`users/${auth.userId}/messages/${args.taskId}`);

  // Verify task exists and is in_progress
  const taskDoc = await taskRef.get();
  if (!taskDoc.exists) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            error: `Task ${args.taskId} not found`,
          }),
        },
      ],
    };
  }

  const taskData = taskDoc.data();
  if (taskData?.status !== "in_progress") {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            error: `Task ${args.taskId} is not in progress (status: ${taskData?.status})`,
          }),
        },
      ],
    };
  }

  await taskRef.update(updates);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          taskId: args.taskId,
          message: "Heartbeat sent successfully",
          ...(args.status && { status: args.status }),
          ...(args.progress !== undefined && { progress: args.progress }),
        }),
      },
    ],
  };
}
