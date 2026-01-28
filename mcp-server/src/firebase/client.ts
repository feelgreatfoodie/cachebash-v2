import * as admin from "firebase-admin";

let db: admin.firestore.Firestore;

/**
 * Initialize Firebase Admin SDK
 * Uses application default credentials or GOOGLE_APPLICATION_CREDENTIALS
 */
export function initializeFirebase(): void {
  if (admin.apps.length === 0) {
    admin.initializeApp({
      // Uses GOOGLE_APPLICATION_CREDENTIALS env var or ADC
    });
  }
  db = admin.firestore();
}

/**
 * Get Firestore instance
 */
export function getFirestore(): admin.firestore.Firestore {
  if (!db) {
    throw new Error("Firebase not initialized. Call initializeFirebase first.");
  }
  return db;
}

/**
 * Get server timestamp for Firestore
 */
export function serverTimestamp(): admin.firestore.FieldValue {
  return admin.firestore.FieldValue.serverTimestamp();
}
