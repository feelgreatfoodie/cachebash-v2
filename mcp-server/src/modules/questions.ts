/**
 * Human-Agent Communication Module
 *
 * Two types of human interaction:
 *
 * 1. Questions (ask_question): agent needs a decision from the operator
 *    - Creates a task with type "question"
 *    - Sends mobile notification with answer options
 *    - Agent polls get_response until answered or timeout
 *
 * 2. Alerts (send_alert): one-way notification, no response needed
 *    - Used for errors, warnings, completion notifications
 *    - Short TTL (15 min default) since they're time-sensitive
 *    - No polling required, just fire-and-forget
 *
 * Question polling pattern:
 * - Agent calls ask_question, gets questionId back
 * - Agent polls get_response every 30s with escalating backoff (30s, 1m, 2m)
 * - When answered, get_response returns { answered: true, answer: "..." }
 * - If timeout (no answer after 30 min), agent escalates or takes default action
 *
 * Why mobile notifications:
 * - Agents often run AFK (operator away from keyboard)
 * - Mobile push ensures operator sees urgent questions even when not at desk
 * - Answer options make responding quick (tap a button, no typing)
 */

import { z } from "zod";
import { getFirestore, serverTimestamp } from "../firebase/client.js";
import { AuthContext } from "../auth/apiKeyValidator.js";
import { Task } from "../types/task.js";

const db = getFirestore();

// Zod validation schemas
const AskQuestionSchema = z.object({
  question: z.string().max(2000),
  options: z.array(z.string().max(100)).max(5).optional(),
  priority: z.enum(["low", "normal", "high"]).optional().default("normal"),
  context: z.string().max(500).optional(),
  threadId: z.string().optional(),
  projectId: z.string().optional(),
});

const GetResponseSchema = z.object({
  questionId: z.string(),
});

const SendAlertSchema = z.object({
  message: z.string().max(2000),
  alertType: z.enum(["error", "warning", "success", "info"]).optional().default("info"),
  priority: z.enum(["low", "normal", "high"]).optional().default("normal"),
  context: z.string().max(500).optional(),
  sessionId: z.string().optional(),
});

/**
 * Ask question handler
 */
export async function askQuestionHandler(auth: AuthContext, args: any) {
  const params = AskQuestionSchema.parse(args);

  const questionId = db.collection("users").doc(auth.userId).collection("tasks").doc().id;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000); // 30 min timeout

  const task: Partial<Task> = {
    id: questionId,
    type: "question",
    title: "Question from agent",
    instructions: params.question,
    question: params.question,
    options: params.options,
    priority: params.priority as any,
    action: "interrupt", // Questions are always high priority
    status: "created",
    source: auth.agentId,
    target: auth.userId, // Target the operator
    createdAt: now,
    updatedAt: now,
    expiresAt,
    context: params.context,
    threadId: params.threadId,
    projectId: params.projectId,
  };

  await db
    .collection("users")
    .doc(auth.userId)
    .collection("tasks")
    .doc(questionId)
    .set(task);

  return {
    content: [{ type: "text", text: JSON.stringify({ questionId, asked: true }) }],
  };
}

/**
 * Get response handler
 */
export async function getResponseHandler(auth: AuthContext, args: any) {
  const params = GetResponseSchema.parse(args);

  const taskDoc = await db
    .collection("users")
    .doc(auth.userId)
    .collection("tasks")
    .doc(params.questionId)
    .get();

  if (!taskDoc.exists) {
    throw new Error("Question not found");
  }

  const task = taskDoc.data() as Task;

  if (task.type !== "question") {
    throw new Error("Task is not a question");
  }

  // Check if answered
  if (task.answer && task.answeredAt) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            answered: true,
            answer: task.answer,
            answeredAt: task.answeredAt,
          }),
        },
      ],
    };
  }

  // Check if expired
  if (task.expiresAt && task.expiresAt < new Date()) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            answered: false,
            expired: true,
            expiresAt: task.expiresAt,
          }),
        },
      ],
    };
  }

  // Still pending
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          answered: false,
          expired: false,
        }),
      },
    ],
  };
}

/**
 * Send alert handler
 */
export async function sendAlertHandler(auth: AuthContext, args: any) {
  const params = SendAlertSchema.parse(args);

  const alertId = db.collection("users").doc(auth.userId).collection("relay").doc().id;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15 * 60 * 1000); // 15 min TTL

  const alert = {
    id: alertId,
    source: auth.agentId,
    target: auth.userId,
    messageType: "STATUS",
    message: `[${params.alertType.toUpperCase()}] ${params.message}`,
    context: params.context,
    priority: params.priority,
    status: "pending",
    createdAt: now,
    expiresAt,
    ttl: 900, // 15 minutes
    alertType: params.alertType,
  };

  await db
    .collection("users")
    .doc(auth.userId)
    .collection("relay")
    .doc(alertId)
    .set(alert);

  return {
    content: [{ type: "text", text: JSON.stringify({ alertId, sent: true }) }],
  };
}
