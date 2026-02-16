/**
 * Firebase Admin SDK Initialization
 *
 * Why firebase-admin instead of client SDK:
 * - Server-side context: this MCP server runs in Node, not browser
 * - Admin privileges: need to bypass Firestore security rules for internal operations
 * - Service account auth: uses application default credentials in cloud environments
 *
 * The admin SDK's FieldValue.serverTimestamp() ensures all timestamps come from the server,
 * preventing clock skew issues when agents run in different timezones or with misconfigured clocks.
 */

import admin from "firebase-admin";

// Initialize Firebase Admin with project ID from environment
const projectId = process.env.FIREBASE_PROJECT_ID || "your-project-id";

if (!admin.apps.length) {
  admin.initializeApp({
    projectId,
  });
}

const db = admin.firestore();

/**
 * Get Firestore instance
 */
export function getFirestore() {
  return db;
}

/**
 * Server timestamp helper for consistent time tracking
 */
export function serverTimestamp() {
  return admin.firestore.FieldValue.serverTimestamp();
}
