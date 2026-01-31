#!/usr/bin/env npx ts-node

/**
 * API Key Verification Script
 *
 * Verifies that an API key is properly registered in Firestore by checking:
 * 1. apiKeys/{sha256(key)} document exists
 * 2. users/{userId}.apiKeyHash matches the computed hash
 *
 * Usage:
 *   npx ts-node verify-api-key.ts <api-key>
 *
 * Or compute the hash locally:
 *   echo -n "YOUR_API_KEY" | shasum -a 256
 */

import * as crypto from "crypto";
import * as admin from "firebase-admin";

// Initialize Firebase Admin (uses GOOGLE_APPLICATION_CREDENTIALS or default credentials)
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

function hashApiKey(apiKey: string): string {
  return crypto.createHash("sha256").update(apiKey).digest("hex");
}

function maskString(str: string, showStart: number = 8, showEnd: number = 4): string {
  if (str.length <= showStart + showEnd) return str;
  return `${str.slice(0, showStart)}...${str.slice(-showEnd)}`;
}

async function verifyApiKey(apiKey: string): Promise<void> {
  console.log("\n=== CacheBash API Key Verification ===\n");

  // Compute hash
  const keyHash = hashApiKey(apiKey);
  console.log(`API Key (masked): ${maskString(apiKey)}`);
  console.log(`SHA-256 Hash: ${keyHash}`);
  console.log(`Hash (partial): ${maskString(keyHash)}`);
  console.log("");

  // Check apiKeys collection
  console.log("1. Checking apiKeys collection...");
  const keyDoc = await db.doc(`apiKeys/${keyHash}`).get();

  if (!keyDoc.exists) {
    console.log("   [FAIL] apiKeys document does NOT exist");
    console.log("\n   DIAGNOSIS: The API key was never registered in Firestore.");
    console.log("   FIX: Regenerate the API key in the Flutter app, which will create this document.");
    console.log("   OR: Manually create the document in Firebase Console:");
    console.log(`   - Collection: apiKeys`);
    console.log(`   - Document ID: ${keyHash}`);
    console.log(`   - Fields: { userId: "<your-firebase-uid>", createdAt: <timestamp> }`);
    return;
  }

  console.log("   [OK] apiKeys document exists");
  const keyData = keyDoc.data();
  const userId = keyData?.userId;

  if (!userId || typeof userId !== "string") {
    console.log("   [FAIL] apiKeys document has no valid userId field");
    console.log("\n   DIAGNOSIS: Document is corrupted.");
    console.log("   FIX: Delete the document and regenerate the API key in the app.");
    return;
  }

  console.log(`   userId: ${maskString(userId)}`);
  console.log("");

  // Check users collection
  console.log("2. Checking users collection...");
  const userDoc = await db.doc(`users/${userId}`).get();

  if (!userDoc.exists) {
    console.log("   [FAIL] users document does NOT exist");
    console.log("\n   DIAGNOSIS: The user account was deleted but apiKeys document remains.");
    console.log("   FIX: Create a new account in the Flutter app.");
    return;
  }

  console.log("   [OK] users document exists");
  const userData = userDoc.data();
  const storedHash = userData?.apiKeyHash;

  if (!storedHash) {
    console.log("   [FAIL] users document has no apiKeyHash field");
    console.log("\n   DIAGNOSIS: User document is incomplete.");
    console.log("   FIX: Regenerate the API key in the Flutter app.");
    return;
  }

  console.log(`   apiKeyHash (stored): ${maskString(storedHash)}`);

  // Compare hashes
  console.log("");
  console.log("3. Comparing hashes...");

  if (storedHash === keyHash) {
    console.log("   [OK] Hashes match!");
    console.log("\n=== VERIFICATION PASSED ===");
    console.log("The API key is properly registered and should work for authentication.");
  } else {
    console.log("   [FAIL] Hashes do NOT match");
    console.log(`   - Expected: ${maskString(keyHash)}`);
    console.log(`   - Stored:   ${maskString(storedHash)}`);
    console.log("\n   DIAGNOSIS: The API key was regenerated in the app.");
    console.log("   FIX: Copy the new API key from the Flutter app to ~/.claude/mcp.json");
  }
}

// Main
const apiKey = process.argv[2];

if (!apiKey) {
  console.log("Usage: npx ts-node verify-api-key.ts <api-key>");
  console.log("");
  console.log("Or compute hash locally:");
  console.log('  echo -n "YOUR_API_KEY" | shasum -a 256');
  process.exit(1);
}

verifyApiKey(apiKey)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error.message);
    process.exit(1);
  });
