/**
 * Task Management Module
 *
 * CRUD operations for tasks with lifecycle enforcement and atomic claiming.
 *
 * Key design decisions:
 *
 * 1. Transactional claiming: uses Firestore transactions to prevent two agents from claiming
 *    the same task. The transaction reads current state, validates lifecycle transition,
 *    then writes the claim. If another agent claimed it concurrently, transaction fails.
 *
 * 2. TTL expiration: tasks can have time-to-live. Expired tasks are filtered out of queries
 *    automatically. A background job (not in this module) archives expired tasks.
 *
 * 3. Idempotent operations: claiming an already-claimed task by the same agent is a no-op.
 *    Completing an already-complete task is a no-op. This makes retries safe.
 *
 * 4. Query optimization: compound indexes on (userId, status, createdAt) and (userId, target, status)
 *    let us efficiently filter tasks without table scans. See firestore.indexes.json for definitions.
 */

import { z } from "zod";
import { getFirestore, serverTimestamp } from "../firebase/client.js";
import { AuthContext } from "../auth/apiKeyValidator.js";
import { Task, TaskType, TaskPriority, TaskAction, TaskStatus } from "../types/task.js";
import { validateTransition, transition } from "../lifecycle/engine.js";

const db = getFirestore();

// Zod validation schemas
const GetTasksSchema = z.object({
  status: z.enum(["created", "active", "all"]).optional().default("created"),
  type: z.enum(["task", "question", "scheduled", "all"]).optional().default("all"),
  target: z.string().max(100).optional(),
  limit: z.number().min(1).max(50).optional().default(10),
});

const CreateTaskSchema = z.object({
  title: z.string().max(200),
  instructions: z.string().max(4000).optional(),
  target: z.string().max(100),
  type: z.enum(["task", "question", "scheduled"]).optional().default("task"),
  priority: z.enum(["low", "normal", "high"]).optional().default("normal"),
  action: z.enum(["interrupt", "parallel", "queue", "backlog"]).optional().default("queue"),
  ttl: z.number().positive().optional(),
  context: z.string().max(500).optional(),
  threadId: z.string().optional(),
  replyTo: z.string().optional(),
  projectId: z.string().optional(),
});

const ClaimTaskSchema = z.object({
  taskId: z.string(),
  sessionId: z.string().optional(),
});

const CompleteTaskSchema = z.object({
  taskId: z.string(),
});

/**
 * Get tasks handler
 */
export async function getTasksHandler(auth: AuthContext, args: any) {
  const params = GetTasksSchema.parse(args);

  let query = db
    .collection("users")
    .doc(auth.userId)
    .collection("tasks")
    .where("status", "in", params.status === "all" ? ["created", "active", "blocked"] : [params.status])
    .orderBy("createdAt", "desc")
    .limit(params.limit);

  // Apply filters
  if (params.type !== "all") {
    query = query.where("type", "==", params.type) as any;
  }

  if (params.target) {
    query = query.where("target", "==", params.target) as any;
  }

  const snapshot = await query.get();
  const now = new Date();

  const tasks = snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() } as Task))
    .filter((task) => !task.expiresAt || task.expiresAt > now); // Filter expired tasks

  return {
    content: [{ type: "text", text: JSON.stringify({ tasks, count: tasks.length }) }],
  };
}

/**
 * Create task handler
 */
export async function createTaskHandler(auth: AuthContext, args: any) {
  const params = CreateTaskSchema.parse(args);

  const taskId = db.collection("users").doc(auth.userId).collection("tasks").doc().id;
  const now = new Date();
  const expiresAt = params.ttl ? new Date(now.getTime() + params.ttl * 1000) : undefined;

  const task: Partial<Task> = {
    id: taskId,
    type: params.type as TaskType,
    title: params.title,
    instructions: params.instructions,
    priority: params.priority as TaskPriority,
    action: params.action as TaskAction,
    status: "created" as TaskStatus,
    source: auth.agentId,
    target: params.target,
    createdAt: now,
    updatedAt: now,
    expiresAt,
    context: params.context,
    threadId: params.threadId,
    replyTo: params.replyTo,
    projectId: params.projectId,
  };

  await db
    .collection("users")
    .doc(auth.userId)
    .collection("tasks")
    .doc(taskId)
    .set(task);

  return {
    content: [{ type: "text", text: JSON.stringify({ task, created: true }) }],
  };
}

/**
 * Claim task handler (transactional)
 */
export async function claimTaskHandler(auth: AuthContext, args: any) {
  const params = ClaimTaskSchema.parse(args);

  const taskRef = db
    .collection("users")
    .doc(auth.userId)
    .collection("tasks")
    .doc(params.taskId);

  try {
    const result = await db.runTransaction(async (transaction) => {
      const taskDoc = await transaction.get(taskRef);

      if (!taskDoc.exists) {
        throw new Error("Task not found");
      }

      const task = taskDoc.data() as Task;

      // Check if already claimed by this agent (idempotent)
      if (task.claimedBy === auth.agentId && task.status === "active") {
        return { task, claimed: false, alreadyClaimed: true };
      }

      // Check if claimed by another agent
      if (task.claimedBy && task.claimedBy !== auth.agentId) {
        throw new Error(`Task already claimed by ${task.claimedBy}`);
      }

      // Validate lifecycle transition
      const entityType = task.type === "question" ? "question" : task.type === "scheduled" ? "scheduled" : "task";
      const newStatus = transition(entityType, task.status, "active");

      // Update task with claim
      transaction.update(taskRef, {
        status: newStatus,
        claimedBy: auth.agentId,
        claimedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      return { task: { ...task, status: newStatus, claimedBy: auth.agentId }, claimed: true };
    });

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  } catch (error: any) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: error.message, claimed: false }) }],
    };
  }
}

/**
 * Complete task handler (transactional)
 */
export async function completeTaskHandler(auth: AuthContext, args: any) {
  const params = CompleteTaskSchema.parse(args);

  const taskRef = db
    .collection("users")
    .doc(auth.userId)
    .collection("tasks")
    .doc(params.taskId);

  try {
    const result = await db.runTransaction(async (transaction) => {
      const taskDoc = await transaction.get(taskRef);

      if (!taskDoc.exists) {
        throw new Error("Task not found");
      }

      const task = taskDoc.data() as Task;

      // Check if already complete (idempotent)
      if (task.status === "done") {
        return { task, completed: false, alreadyComplete: true };
      }

      // Validate lifecycle transition
      const entityType = task.type === "question" ? "question" : task.type === "scheduled" ? "scheduled" : "task";

      // Questions skip "completing" state, go directly to "done"
      const newStatus = entityType === "question" ? transition(entityType, task.status, "done") : transition(entityType, task.status, "completing");

      transaction.update(taskRef, {
        status: newStatus === "completing" ? "done" : newStatus, // Auto-complete for tasks without validation step
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      return { task: { ...task, status: "done" }, completed: true };
    });

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  } catch (error: any) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: error.message, completed: false }) }],
    };
  }
}
