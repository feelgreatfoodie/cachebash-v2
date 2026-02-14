import * as admin from "firebase-admin";

// Initialize Firebase Admin SDK
admin.initializeApp();

// Export auth triggers
export { onUserCreate } from "./auth/onUserCreate";

// Export notification triggers
export { onQuestionCreate } from "./notifications/onQuestionCreate";
export { onMessageCreate } from "./notifications/onMessageCreate";
export { onSessionUpdate } from "./notifications/onSessionUpdate";

// Export migration functions
export { migrateUserToMessages } from "./migrations/migrateToMessages";
export { migrateInterruptsToMessages } from "./migrations/migrateInterruptsToMessages";

// Export session cleanup
export { cleanupExpiredSessions } from "./sessions/cleanupExpiredSessions";

// Export orphaned task cleanup
export { cleanupOrphanedTasks, cleanupOrphanedLegacyTasks } from "./tasks/cleanupOrphanedTasks";

// Export sprint triggers
export { onStoryUpdate } from "./sprints/onStoryUpdate";

// Export dream session triggers
export { onDreamSessionUpdate } from "./notifications/onDreamSessionUpdate";

// Export relay cleanup
export { cleanupExpiredRelay } from "./relay/cleanupExpiredRelay";
