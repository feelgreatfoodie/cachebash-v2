/**
 * User Creation Trigger
 *
 * Runs when a new user signs up via Firebase Auth.
 * Initializes their user document with default settings.
 *
 * The data model stores all user-specific data under users/{uid}/ as subcollections:
 * - tasks/: Work items assigned to this user's agents
 * - relay/: Inter-agent message queue
 * - sessions/: Active agent execution contexts
 * - devices/: Registered mobile devices for push notifications
 * - ledger/: Usage tracking and billing
 *
 * This multi-tenant structure provides natural data isolation — Firestore rules
 * ensure users can only access their own subcollections.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

export const onUserCreate = functions.auth.user().onCreate(async (user) => {
  const db = admin.firestore();
  const uid = user.uid;

  // Create the user's root document with default preferences
  await db.collection('users').doc(uid).set({
    email: user.email || null,
    displayName: user.displayName || null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),

    // Default notification preferences
    // Users can update these later via their account settings
    notifications: {
      tasks: true,        // Notify on new task assignments
      questions: true,    // Notify on questions requiring user input
      sessions: true,     // Notify on session state changes (blocked, done)
      priority: 'normal'  // Notification priority threshold (low, normal, high)
    }
  });

  console.log(`User document initialized for ${uid}`);
});
