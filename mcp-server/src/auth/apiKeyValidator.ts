/**
 * API Key Validation
 *
 * Authentication flow:
 * 1. Client sends API key in Authorization: Bearer <key> header
 * 2. Server hashes key with SHA-256 (same hash used during key creation)
 * 3. Lookup in Firestore apiKeys/{hash} collection
 * 4. Validate active status, check revocation, extract user and agent identity
 * 5. Update lastUsedAt timestamp asynchronously (fire-and-forget for performance)
 *
 * Why hash the keys:
 * - Storage security: if the database leaks, raw keys aren't exposed
 * - One-way function: can't reverse the hash to get original keys
 * - Fast lookup: SHA-256 is deterministic, so we can use it as document ID
 *
 * Why fire-and-forget lastUsedAt:
 * - Auth checks are on the hot path, can't afford to wait for Firestore write
 * - lastUsedAt is observability data, not critical for correctness
 * - If the update fails, worst case is stale usage timestamp
 */

import crypto from "crypto";
import { getFirestore } from "../firebase/client.js";

export interface AuthContext {
  userId: string;
  agentId: string;
  apiKeyHash: string;
}

/**
 * Hash an API key using SHA-256
 */
function hashApiKey(apiKey: string): string {
  return crypto.createHash("sha256").update(apiKey).digest("hex");
}

/**
 * Validate an API key and return auth context
 * Returns null if key is invalid, revoked, or not found
 */
export async function validateApiKey(apiKey: string): Promise<AuthContext | null> {
  const hash = hashApiKey(apiKey);
  const db = getFirestore();

  try {
    const keyDoc = await db.collection("apiKeys").doc(hash).get();

    if (!keyDoc.exists) {
      return null;
    }

    const keyData = keyDoc.data();
    if (!keyData) {
      return null;
    }

    // Check if key is active and not revoked
    if (!keyData.active || keyData.revoked) {
      return null;
    }

    // Update lastUsedAt timestamp asynchronously (fire-and-forget)
    keyDoc.ref.update({ lastUsedAt: new Date() }).catch((err) => {
      console.error("Failed to update lastUsedAt:", err);
    });

    return {
      userId: keyData.userId,
      agentId: keyData.agentId,
      apiKeyHash: hash,
    };
  } catch (error) {
    console.error("API key validation error:", error);
    return null;
  }
}
