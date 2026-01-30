import * as admin from "firebase-admin";
import { config } from "../config";

let db: admin.firestore.Firestore | null = null;

export function initializeFirebase(): void {
  if (admin.apps.length === 0) {
    const options: admin.AppOptions = {};

    if (config.FIREBASE_PROJECT_ID !== undefined && config.FIREBASE_PROJECT_ID !== "") {
      options.projectId = config.FIREBASE_PROJECT_ID;
    }

    admin.initializeApp(options);
  }
  db = admin.firestore();
}

export function getFirestore(): admin.firestore.Firestore {
  if (!db) {
    throw new Error("Firebase not initialized. Call initializeFirebase first.");
  }
  return db;
}

export function serverTimestamp(): admin.firestore.FieldValue {
  return admin.firestore.FieldValue.serverTimestamp();
}
