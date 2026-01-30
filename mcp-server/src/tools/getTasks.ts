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
  data: { title: string; instructions: string; encrypted?: boolean },
  apiKey: string
): { title: string; instructions: string } {
  if (!data.encrypted) {
    return { title: data.title, instructions: data.instructions };
  }

  try {
    return {
      title: isEncrypted(data.title) ? decrypt(data.title, apiKey) : data.title,
      instructions: isEncrypted(data.instructions)
        ? decrypt(data.instructions, apiKey)
        : data.instructions,
    };
  } catch (error) {
    console.error("Failed to decrypt task data:", error);
    return { title: data.title, instructions: data.instructions };
  }
}

/**
 * Get pending tasks created by the user in the mobile app.
 * Use this to check if there's work waiting for you.
 */
export async function getPendingTasks(
  auth: AuthContext,
  args: GetTasksArgs
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const db = getFirestore();
  const status = args.status || "pending";
  const limit = args.limit || 10;

  let query = db.collection(`users/${auth.userId}/tasks`);

  if (status !== "all") {
    query = query.where("status", "==", status) as any;
  }

  const snapshot = await query
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  if (snapshot.empty) {
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

  const tasks = snapshot.docs.map((doc) => {
    const data = doc.data();
    const decrypted = decryptTaskData(
      {
        title: data.title,
        instructions: data.instructions,
        encrypted: data.encrypted,
      },
      auth.apiKey
    );
    return {
      id: doc.id,
      title: decrypted.title,
      instructions: decrypted.instructions,
      priority: data.priority,
      status: data.status,
      projectId: data.projectId || null,
      createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
    };
  });

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
 */
export async function claimTask(
  auth: AuthContext,
  args: ClaimTaskArgs
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const db = getFirestore();

  const taskRef = db.doc(`users/${auth.userId}/tasks/${args.taskId}`);
  const taskDoc = await taskRef.get();

  if (!taskDoc.exists) {
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

  const taskData = taskDoc.data();

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

  await taskRef.update({
    status: "in_progress",
    startedAt: serverTimestamp(),
    sessionId: args.sessionId || null,
  });

  // Decrypt task data before returning
  const decrypted = decryptTaskData(
    {
      title: taskData.title,
      instructions: taskData.instructions,
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
          priority: taskData.priority,
          message: "Task claimed. You can now work on it.",
        }),
      },
    ],
  };
}

/**
 * Mark a task as complete.
 */
export async function completeTask(
  auth: AuthContext,
  args: CompleteTaskArgs
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const db = getFirestore();

  const taskRef = db.doc(`users/${auth.userId}/tasks/${args.taskId}`);
  const taskDoc = await taskRef.get();

  if (!taskDoc.exists) {
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

  await taskRef.update({
    status: "complete",
    completedAt: serverTimestamp(),
  });

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
