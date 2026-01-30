import * as admin from "firebase-admin";
import { getFirestore, serverTimestamp } from "../lib/firebase";
import { logger } from "../lib/logger";
import {
  AskQuestionInput,
  GetResponseInput,
  UpdateStatusInput,
  PinTaskInput,
  ResumeTaskInput,
} from "./types";

// Firestore document data types
interface QuestionData {
  status: string;
  response: string | null;
  answeredAt: admin.firestore.Timestamp | null;
}

interface TaskData {
  state: string;
  questionId: string;
  context: string;
}

interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

function successResult(data: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
  };
}

function errorResult(message: string): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify({ success: false, error: message }) }],
    isError: true,
  };
}

export async function askQuestion(
  userId: string,
  input: AskQuestionInput
): Promise<ToolResult> {
  const db = getFirestore();

  const questionData = {
    question: input.question,
    options: input.options ?? null,
    priority: input.priority,
    context: input.context ?? null,
    projectId: input.projectId ?? null,
    status: "pending",
    createdAt: serverTimestamp(),
    response: null,
    answeredAt: null,
    archived: false,
    deletedAt: null,
  };

  try {
    const questionRef = await db
      .collection(`users/${userId}/questions`)
      .add(questionData);

    logger.info("Question created", {
      userId,
      questionId: questionRef.id,
      priority: input.priority,
      action: "ask_question",
    });

    return successResult({
      success: true,
      questionId: questionRef.id,
      message: `Question sent to user's device. Use get_response with questionId "${questionRef.id}" to check for a response.`,
    });
  } catch (error) {
    logger.error("Failed to create question", {
      userId,
      error: error instanceof Error ? error.message : String(error),
      action: "ask_question_error",
    });
    return errorResult("Failed to send question");
  }
}

export async function getResponse(
  userId: string,
  input: GetResponseInput
): Promise<ToolResult> {
  const db = getFirestore();

  try {
    const questionDoc = await db
      .doc(`users/${userId}/questions/${input.questionId}`)
      .get();

    if (!questionDoc.exists) {
      return errorResult("Question not found");
    }

    const rawData = questionDoc.data();
    if (rawData === undefined) {
      return errorResult("Question data not available");
    }
    const data = rawData as QuestionData;

    if (data.status === "answered" && data.response !== null) {
      let answeredAtIso: string | null = null;
      if (data.answeredAt !== null && typeof data.answeredAt.toDate === "function") {
        answeredAtIso = data.answeredAt.toDate().toISOString();
      }
      return successResult({
        success: true,
        answered: true,
        response: data.response,
        answeredAt: answeredAtIso,
      });
    }

    if (data.status === "expired") {
      return successResult({
        success: true,
        answered: false,
        expired: true,
        message: "Question has expired without a response",
      });
    }

    return successResult({
      success: true,
      answered: false,
      status: data.status,
      message: "Waiting for user response",
    });
  } catch (error) {
    logger.error("Failed to get response", {
      userId,
      questionId: input.questionId,
      error: error instanceof Error ? error.message : String(error),
      action: "get_response_error",
    });
    return errorResult("Failed to check response");
  }
}

export async function updateStatus(
  userId: string,
  input: UpdateStatusInput
): Promise<ToolResult> {
  const db = getFirestore();

  const sessionId = input.sessionId ?? `session_${Date.now()}`;

  const sessionData = {
    name: input.status,
    status: input.status,
    state: input.state,
    progress: input.progress ?? null,
    lastUpdate: serverTimestamp(),
  };

  try {
    await db
      .doc(`users/${userId}/sessions/${sessionId}`)
      .set(sessionData, { merge: true });

    logger.info("Status updated", {
      userId,
      sessionId,
      state: input.state,
      action: "update_status",
    });

    return successResult({
      success: true,
      sessionId,
      message: `Status updated: "${input.status}"`,
    });
  } catch (error) {
    logger.error("Failed to update status", {
      userId,
      error: error instanceof Error ? error.message : String(error),
      action: "update_status_error",
    });
    return errorResult("Failed to update status");
  }
}

export async function pinTask(
  userId: string,
  input: PinTaskInput
): Promise<ToolResult> {
  const db = getFirestore();

  const taskData = {
    questionId: input.questionId,
    context: input.context,
    state: "pinned",
    pinnedAt: serverTimestamp(),
    resumedAt: null,
  };

  try {
    await db
      .doc(`users/${userId}/sessions/${input.taskId}`)
      .set(taskData, { merge: true });

    logger.info("Task pinned", {
      userId,
      taskId: input.taskId,
      questionId: input.questionId,
      action: "pin_task",
    });

    return successResult({
      success: true,
      taskId: input.taskId,
      message: `Task pinned. Use resume_task with taskId "${input.taskId}" to resume when ready.`,
    });
  } catch (error) {
    logger.error("Failed to pin task", {
      userId,
      taskId: input.taskId,
      error: error instanceof Error ? error.message : String(error),
      action: "pin_task_error",
    });
    return errorResult("Failed to pin task");
  }
}

export async function resumeTask(
  userId: string,
  input: ResumeTaskInput
): Promise<ToolResult> {
  const db = getFirestore();

  try {
    const taskDoc = await db
      .doc(`users/${userId}/sessions/${input.taskId}`)
      .get();

    if (!taskDoc.exists) {
      return errorResult("Task not found");
    }

    const rawTaskData = taskDoc.data();
    if (rawTaskData === undefined) {
      return errorResult("Task data not available");
    }
    const taskData = rawTaskData as TaskData;

    if (taskData.state !== "pinned") {
      return errorResult("Task is not in pinned state");
    }

    // Get the question response if available
    let questionResponse: string | null = null;
    if (typeof taskData.questionId === "string" && taskData.questionId !== "") {
      const questionDoc = await db
        .doc(`users/${userId}/questions/${taskData.questionId}`)
        .get();

      if (questionDoc.exists) {
        const questionData = questionDoc.data() as QuestionData | undefined;
        if (questionData?.status === "answered" && questionData.response !== null) {
          questionResponse = questionData.response;
        }
      }
    }

    // Update task state
    await db.doc(`users/${userId}/sessions/${input.taskId}`).update({
      state: "working",
      resumedAt: serverTimestamp(),
    });

    logger.info("Task resumed", {
      userId,
      taskId: input.taskId,
      hasResponse: questionResponse !== null,
      action: "resume_task",
    });

    return successResult({
      success: true,
      taskId: input.taskId,
      context: taskData.context,
      response: questionResponse,
      message: questionResponse !== null
        ? "Task resumed with user response"
        : "Task resumed (no response yet)",
    });
  } catch (error) {
    logger.error("Failed to resume task", {
      userId,
      taskId: input.taskId,
      error: error instanceof Error ? error.message : String(error),
      action: "resume_task_error",
    });
    return errorResult("Failed to resume task");
  }
}
