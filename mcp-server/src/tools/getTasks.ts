import { getFirestore, serverTimestamp } from "../firebase/client.js";
import { AuthContext } from "../auth/apiKeyValidator.js";
import { decrypt, isEncrypted } from "../encryption/crypto.js";

interface GetTasksArgs {
  status?: "pending" | "in_progress" | "all";
  limit?: number;
}

interface ClaimTaskArgs {
  taskId: string;
  sessionId?: string;
}

interface CompleteTaskArgs {
  taskId: string;
}

/**
 * Decrypt task data if encrypted
 */
function decryptTaskData(
  data: { title: string; instructions: string; action?: string; encrypted?: boolean },
  apiKey: string
): { title: string; instructions: string; action: string } {
  if (!data.encrypted) {
    return {
      title: data.title,
      instructions: data.instructions,
      action: data.action || "queue",
    };
  }

  try {
    return {
      title: isEncrypted(data.title) ? decrypt(data.title, apiKey) : data.title,
      instructions: isEncrypted(data.instructions)
        ? decrypt(data.instructions, apiKey)
        : data.instructions,
      action: data.action && isEncrypted(data.action)
        ? decrypt(data.action, apiKey)
        : data.action || "queue",
    };
  } catch (error) {
    console.error("Failed to decrypt task data:", error);
    return {
      title: data.title,
      instructions: data.instructions,
      action: data.action || "queue",
    };
  }
}

/**
 * Get pending tasks created by the user in the mobile app.
 * Use this to check if there's work waiting for you.
 *
 * Reads from both /tasks (legacy) and /messages (unified) collections,
 * preferring messages collection if available.
 */
export async function getPendingTasks(
  auth: AuthContext,
  args: GetTasksArgs
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const db = getFirestore();
  const status = args.status || "pending";
  const limit = args.limit || 10;

  // Try unified messages collection first
  let messagesQuery = db
    .collection(`users/${auth.userId}/messages`)
    .where("direction", "==", "to_claude");

  if (status !== "all") {
    messagesQuery = messagesQuery.where("status", "==", status) as any;
  }

  const messagesSnapshot = await messagesQuery
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  // Also check legacy tasks collection
  let tasksQuery = db.collection(`users/${auth.userId}/tasks`);

  if (status !== "all") {
    tasksQuery = tasksQuery.where("status", "==", status) as any;
  }

  const tasksSnapshot = await tasksQuery
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  // Combine results, deduplicating by ID (messages takes precedence)
  const seenIds = new Set<string>();
  const allTasks: Array<{
    id: string;
    title: string;
    instructions: string;
    action: string;
    priority: string;
    status: string;
    projectId: string | null;
    createdAt: string | null;
  }> = [];

  // Process messages first
  for (const doc of messagesSnapshot.docs) {
    const data = doc.data();
    const decrypted = decryptTaskData(
      {
        title: data.title || data.content?.substring(0, 50) || "Untitled",
        instructions: data.content || data.instructions || "",
        action: data.action,
        encrypted: data.encrypted,
      },
      auth.apiKey
    );
    seenIds.add(doc.id);
    allTasks.push({
      id: doc.id,
      title: decrypted.title,
      instructions: decrypted.instructions,
      action: decrypted.action,
      priority: data.priority,
      status: data.status,
      projectId: data.projectId || null,
      createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
    });
  }

  // Add legacy tasks that aren't in messages
  for (const doc of tasksSnapshot.docs) {
    if (seenIds.has(doc.id)) continue;
    const data = doc.data();
    const decrypted = decryptTaskData(
      {
        title: data.title,
        instructions: data.instructions,
        action: data.action,
        encrypted: data.encrypted,
      },
      auth.apiKey
    );
    allTasks.push({
      id: doc.id,
      title: decrypted.title,
      instructions: decrypted.instructions,
      action: decrypted.action,
      priority: data.priority,
      status: data.status,
      projectId: data.projectId || null,
      createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
    });
  }

  if (allTasks.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            hasTasks: false,
            tasks: [],
            message: `No ${status} tasks found`,
          }),
        },
      ],
    };
  }

  // Sort by createdAt descending and limit
  allTasks.sort((a, b) => {
    if (!a.createdAt) return 1;
    if (!b.createdAt) return -1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  const tasks = allTasks.slice(0, limit);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          hasTasks: true,
          count: tasks.length,
          tasks,
          message: `Found ${tasks.length} ${status} task(s)`,
        }),
      },
    ],
  };
}

/**
 * Claim a task to start working on it.
 * This marks the task as in_progress so it won't be picked up again.
 *
 * Updates both /tasks (legacy) and /messages (unified) collections.
 */
export async function claimTask(
  auth: AuthContext,
  args: ClaimTaskArgs
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const db = getFirestore();

  // Try messages collection first
  const messageRef = db.doc(`users/${auth.userId}/messages/${args.taskId}`);
  const messageDoc = await messageRef.get();

  // Fall back to legacy tasks collection
  const taskRef = db.doc(`users/${auth.userId}/tasks/${args.taskId}`);
  const taskDoc = await taskRef.get();

  const doc = messageDoc.exists ? messageDoc : taskDoc;

  if (!doc.exists) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            error: "Task not found",
          }),
        },
      ],
    };
  }

  const taskData = doc.data();

  if (taskData?.status !== "pending") {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            error: `Task is not pending (current status: ${taskData?.status})`,
          }),
        },
      ],
    };
  }

  const updateData = {
    status: "in_progress",
    startedAt: serverTimestamp(),
    sessionId: args.sessionId || null,
  };

  // Update both collections
  if (messageDoc.exists) {
    await messageRef.update(updateData);
  }
  if (taskDoc.exists) {
    await taskRef.update(updateData);
  }

  // Decrypt task data before returning
  const decrypted = decryptTaskData(
    {
      title: taskData.title || taskData.content?.substring(0, 50) || "Untitled",
      instructions: taskData.content || taskData.instructions || "",
      action: taskData.action,
      encrypted: taskData.encrypted,
    },
    auth.apiKey
  );

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          taskId: args.taskId,
          title: decrypted.title,
          instructions: decrypted.instructions,
          action: decrypted.action,
          priority: taskData.priority,
          message: "Task claimed. You can now work on it.",
        }),
      },
    ],
  };
}

/**
 * Mark a task as complete.
 *
 * Updates both /tasks (legacy) and /messages (unified) collections.
 */
export async function completeTask(
  auth: AuthContext,
  args: CompleteTaskArgs
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const db = getFirestore();

  // Try messages collection first
  const messageRef = db.doc(`users/${auth.userId}/messages/${args.taskId}`);
  const messageDoc = await messageRef.get();

  // Fall back to legacy tasks collection
  const taskRef = db.doc(`users/${auth.userId}/tasks/${args.taskId}`);
  const taskDoc = await taskRef.get();

  if (!messageDoc.exists && !taskDoc.exists) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            error: "Task not found",
          }),
        },
      ],
    };
  }

  const updateData = {
    status: "complete",
    completedAt: serverTimestamp(),
  };

  // Update both collections
  if (messageDoc.exists) {
    await messageRef.update(updateData);
  }
  if (taskDoc.exists) {
    await taskRef.update(updateData);
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          taskId: args.taskId,
          message: "Task marked as complete",
        }),
      },
    ],
  };
}
