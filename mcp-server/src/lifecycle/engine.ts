/**
 * Lifecycle State Machine
 *
 * This engine enforces valid state transitions for tasks and sessions. Why a state machine:
 *
 * 1. Prevents corruption: can't mark a task "done" if it was never "active"
 * 2. Atomic transitions: Firestore transactions ensure only one agent can claim a task
 * 3. Observability: every state change is auditable, makes debugging easier
 * 4. Idempotency: retrying a transition that already happened is safe (no-op)
 *
 * Seven lifecycle states (not all valid for every entity type):
 *
 * created → active: agent claims work
 * active → blocked: waiting on external dependency
 * blocked → active: dependency resolved, resume work
 * active → completing: work done, running cleanup/validation
 * completing → done: cleanup complete, success
 * completing → failed: cleanup failed or validation error
 * * → archived: soft delete, moved to cold storage
 *
 * Why "completing" state:
 * - Some tasks need post-work validation (tests pass, API responds, etc.)
 * - Separating "completing" from "done" lets us retry validation without re-doing the work
 * - Also useful for multi-step tasks where partial progress needs to be saved
 *
 * Entity types have different valid transitions:
 * - Tasks: full lifecycle (created → active → completing → done)
 * - Questions: skip completing (created → active → done when answered)
 * - Sessions: no "completing" state (working → complete directly)
 * - Scheduled tasks: can auto-transition based on triggers
 */

export type LifecycleState = "created" | "active" | "blocked" | "completing" | "done" | "failed" | "archived";

export type EntityType = "task" | "question" | "scheduled" | "session";

/**
 * Valid state transitions for each entity type
 * Map format: { currentState: [allowedNextStates] }
 */
const TASK_TRANSITIONS: Record<string, LifecycleState[]> = {
  created: ["active", "archived"],
  active: ["blocked", "completing", "failed", "archived"],
  blocked: ["active", "failed", "archived"],
  completing: ["done", "failed", "archived"],
  done: ["archived"],
  failed: ["archived"],
  archived: [], // Terminal state, no further transitions
};

const QUESTION_TRANSITIONS: Record<string, LifecycleState[]> = {
  created: ["active", "archived"],
  active: ["done", "failed", "archived"], // Questions skip "completing"
  done: ["archived"],
  failed: ["archived"],
  archived: [],
};

const SESSION_TRANSITIONS: Record<string, LifecycleState[]> = {
  created: ["active", "archived"],
  active: ["blocked", "done", "failed", "archived"],
  blocked: ["active", "failed", "archived"],
  done: ["archived"],
  failed: ["archived"],
  archived: [],
};

const SCHEDULED_TRANSITIONS: Record<string, LifecycleState[]> = {
  created: ["active", "archived"],
  active: ["completing", "failed", "archived"],
  completing: ["done", "failed", "archived"],
  done: ["created", "archived"], // Recurring tasks loop back to "created"
  failed: ["archived"],
  archived: [],
};

/**
 * Get valid transitions for an entity type
 */
function getTransitionMap(entityType: EntityType): Record<string, LifecycleState[]> {
  switch (entityType) {
    case "task":
      return TASK_TRANSITIONS;
    case "question":
      return QUESTION_TRANSITIONS;
    case "session":
      return SESSION_TRANSITIONS;
    case "scheduled":
      return SCHEDULED_TRANSITIONS;
    default:
      throw new Error(`Unknown entity type: ${entityType}`);
  }
}

/**
 * Validate a state transition
 * Returns true if transition is allowed, false otherwise
 */
export function validateTransition(
  entityType: EntityType,
  currentState: LifecycleState,
  nextState: LifecycleState
): boolean {
  const transitions = getTransitionMap(entityType);
  const allowedStates = transitions[currentState] || [];
  return allowedStates.includes(nextState);
}

/**
 * Transition an entity to a new state
 * Throws LifecycleError if transition is invalid
 */
export function transition(
  entityType: EntityType,
  currentState: LifecycleState,
  nextState: LifecycleState
): LifecycleState {
  if (!validateTransition(entityType, currentState, nextState)) {
    throw new LifecycleError(
      `Invalid transition for ${entityType}: ${currentState} → ${nextState}`
    );
  }
  return nextState;
}

/**
 * Custom error for lifecycle violations
 */
export class LifecycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LifecycleError";
  }
}
