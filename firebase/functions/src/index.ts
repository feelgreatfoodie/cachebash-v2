import * as admin from "firebase-admin";

// Initialize Firebase Admin SDK
admin.initializeApp();

// Export auth triggers
export { onUserCreate } from "./auth/onUserCreate";

// Export notification triggers
export { onQuestionCreate } from "./notifications/onQuestionCreate";
