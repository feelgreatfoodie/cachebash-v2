import * as crypto from "crypto";
import { getFirestore } from "../firebase/client.js";

export interface AuthContext {
  userId: string;
  apiKeyHash: string;
  apiKey: string; // Stored in memory only for E2E encryption
}

/**
 * Hash an API key using SHA-256 (same algorithm as Flutter app)
 */
function hashApiKey(apiKey: string): string {
  return crypto.createHash("sha256").update(apiKey).digest("hex");
}

/**
 * Validate an API key against Firestore
 * Returns auth context if valid, null if invalid
 */
export async function validateApiKey(
  apiKey: string
): Promise<AuthContext | null> {
  const keyHash = hashApiKey(apiKey);
  const db = getFirestore();

  try {
    // Look up the key hash in the apiKeys collection
    const keyDoc = await db.doc(`apiKeys/${keyHash}`).get();

    if (!keyDoc.exists) {
      return null;
    }

    const data = keyDoc.data();
    if (!data?.userId) {
      return null;
    }

    // Verify the user exists and the hash matches
    const userDoc = await db.doc(`users/${data.userId}`).get();
    if (!userDoc.exists) {
      return null;
    }

    const userData = userDoc.data();
    if (userData?.apiKeyHash !== keyHash) {
      // Key has been regenerated
      return null;
    }

    return {
      userId: data.userId,
      apiKeyHash: keyHash,
      apiKey: apiKey, // Keep in memory for E2E encryption
    };
  } catch (error) {
    console.error("API key validation error:", error);
    return null;
  }
}

// Store the auth context for the current session
let currentAuthContext: AuthContext | null = null;

/**
 * Set the auth context for the current session
 */
export function setAuthContext(context: AuthContext): void {
  currentAuthContext = context;
}

/**
 * Get the current auth context
 */
export function getAuthContext(): AuthContext | null {
  return currentAuthContext;
}
