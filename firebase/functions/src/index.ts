import * as admin from "firebase-admin";

// Initialize Firebase Admin SDK
admin.initializeApp();

// Export auth triggers
export { onUserCreate } from "./auth/onUserCreate";

// Export notification triggers
export { onQuestionCreate } from "./notifications/onQuestionCreate";
export { onMessageCreate } from "./notifications/onMessageCreate";

// Export migration functions
export { migrateUserToMessages } from "./migrations/migrateToMessages";
export { migrateInterruptsToMessages } from "./migrations/migrateInterruptsToMessages";

// Export session cleanup
export { cleanupExpiredSessions } from "./sessions/cleanupExpiredSessions";
