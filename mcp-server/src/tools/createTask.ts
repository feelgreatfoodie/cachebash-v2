import { getFirestore, serverTimestamp } from "../firebase/client.js";
import { AuthContext } from "../auth/apiKeyValidator.js";
import { CreateTaskSchema } from "../validation/validators.js";

/**
 * Create a new task for a program (Claude Code session) to work on.
 * Writes to both /messages (unified) and /tasks (legacy) collections.
 *
 * This is the MCP equivalent of the mobile app's "Create Task" flow.
 * Used by orchestrators to dispatch work to agents.
 */
export async function createTask(
  auth: AuthContext,
  rawArgs: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const args = CreateTaskSchema.parse(rawArgs);
  const db = getFirestore();

  const preview = args.title.length > 50
    ? args.title.substring(0, 47) + "..."
    : args.title;

  const taskData: Record<string, unknown> = {
    direction: "to_claude",
    title: args.title,
    content: args.instructions || "",
    instructions: args.instructions || "",
    preview,
    priority: args.priority || "normal",
    action: args.action || "queue",
    status: "pending",
    projectId: args.projectId || null,
    source: args.source || "orchestrator",
    target: args.target || null,
    createdAt: serverTimestamp(),
    archived: false,
    deletedAt: null,
    encrypted: false,
  };

  // Write to unified messages collection
  const ref = await db
    .collection(`users/${auth.userId}/messages`)
    .add(taskData);

  const taskId = ref.id;

  // Also write to legacy tasks collection with same ID
  await db
    .collection(`users/${auth.userId}/tasks`)
    .doc(taskId)
    .set(taskData);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          taskId,
          title: args.title,
          action: args.action || "queue",
          message: `Task created. ID: "${taskId}"`,
        }),
      },
    ],
  };
}
