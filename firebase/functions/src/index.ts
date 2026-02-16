/**
 * CacheBash Cloud Functions
 *
 * Entry point for all serverless functions:
 * - Auth triggers: Initialize user data on account creation
 * - Firestore triggers: Send push notifications for task/session updates
 * - Scheduled jobs: Clean up expired sessions and messages
 */

import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK
// This provides elevated privileges to bypass Firestore security rules
// for server-side operations like creating user documents and cleanup jobs.
admin.initializeApp();

// Export all Cloud Functions
export { onUserCreate } from './auth/onUserCreate';
export { onTaskCreate } from './notifications/onTaskCreate';
export { onSessionUpdate } from './notifications/onSessionUpdate';
export { cleanupExpiredSessions } from './cleanup/cleanupExpiredSessions';
export { cleanupExpiredMessages } from './cleanup/cleanupExpiredMessages';
