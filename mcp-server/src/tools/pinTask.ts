import { getFirestore, serverTimestamp } from "../firebase/client.js";
import { AuthContext } from "../auth/apiKeyValidator.js";
import { PinTaskSchema, ResumeTaskSchema } from "../validation/validators.js";

/**
 * Pin the current task to resume later when user responds
 */
export async function pinTask(
  auth: AuthContext,
  rawArgs: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const args = PinTaskSchema.parse(rawArgs);
  const db = getFirestore();

  const taskData = {
    questionId: args.questionId,
    context: args.context,
    state: "pinned",
    pinnedAt: serverTimestamp(),
    resumedAt: null,
  };

  // Store pinned task
  await db.doc(`users/${auth.userId}/sessions/${args.taskId}`).set(taskData, {
    merge: true,
  });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          taskId: args.taskId,
          message: `Task pinned. Use resume_task with taskId "${args.taskId}" to resume when ready.`,
        }),
      },
    ],
  };
}

/**
 * Resume a previously pinned task
 */
export async function resumeTask(
  auth: AuthContext,
  rawArgs: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const args = ResumeTaskSchema.parse(rawArgs);
  const db = getFirestore();

  // Get pinned task
  const taskDoc = await db
    .doc(`users/${auth.userId}/sessions/${args.taskId}`)
    .get();

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

  if (taskData?.state !== "pinned") {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            error: "Task is not in pinned state",
          }),
        },
      ],
    };
  }

  // Get the question response if available
  let response = null;
  if (taskData?.questionId) {
    const questionDoc = await db
      .doc(`users/${auth.userId}/questions/${taskData.questionId}`)
      .get();

    if (questionDoc.exists) {
      const questionData = questionDoc.data();
      if (questionData?.status === "answered") {
        response = questionData.response;
      }
    }
  }

  // Update task state
  await db.doc(`users/${auth.userId}/sessions/${args.taskId}`).update({
    state: "working",
    resumedAt: serverTimestamp(),
  });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          taskId: args.taskId,
          context: taskData?.context || null,
          response,
          message: response
            ? "Task resumed with user response"
            : "Task resumed (no response yet)",
        }),
      },
    ],
  };
}
