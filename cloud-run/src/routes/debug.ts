import { Router, Request, Response } from "express";
import * as crypto from "crypto";
import { getFirestore } from "../lib/firebase";
import { logger } from "../lib/logger";

const router = Router();

interface AuthDiagnostics {
  keyProvided: boolean;
  keyHashPartial: string | null;
  apiKeysDocExists: boolean;
  usersDocExists: boolean;
  usersDocHashMatch: boolean;
  failureReason:
    | "key_not_registered"
    | "user_not_found"
    | "key_regenerated"
    | "validation_error"
    | "success"
    | null;
  hint: string | null;
  userId: string | null;
}

function hashApiKey(apiKey: string): string {
  return crypto.createHash("sha256").update(apiKey).digest("hex");
}

function maskHash(hash: string): string {
  // Show first 8 and last 4 characters for debugging
  if (hash.length < 16) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-4)}`;
}

router.get("/debug/auth", async (req: Request, res: Response<AuthDiagnostics>) => {
  const diagnostics: AuthDiagnostics = {
    keyProvided: false,
    keyHashPartial: null,
    apiKeysDocExists: false,
    usersDocExists: false,
    usersDocHashMatch: false,
    failureReason: null,
    hint: null,
    userId: null,
  };

  try {
    // Parse Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      diagnostics.failureReason = "validation_error";
      diagnostics.hint = "No Authorization header provided. Use: Authorization: Bearer <api_key>";
      return res.status(400).json(diagnostics);
    }

    const match = /^Bearer\s+(.+)$/i.exec(authHeader);
    if (!match || !match[1]) {
      diagnostics.failureReason = "validation_error";
      diagnostics.hint = "Invalid Authorization format. Use: Bearer <api_key>";
      return res.status(400).json(diagnostics);
    }

    const apiKey = match[1];
    diagnostics.keyProvided = true;

    const keyHash = hashApiKey(apiKey);
    diagnostics.keyHashPartial = maskHash(keyHash);

    logger.info("Debug auth check", {
      keyHashPartial: diagnostics.keyHashPartial,
      action: "debug_auth_check",
    });

    const db = getFirestore();

    // Check apiKeys collection
    const keyDoc = await db.doc(`apiKeys/${keyHash}`).get();
    diagnostics.apiKeysDocExists = keyDoc.exists;

    if (!keyDoc.exists) {
      diagnostics.failureReason = "key_not_registered";
      diagnostics.hint =
        "The apiKeys/{hash} document does not exist in Firestore. " +
        "This means the API key was never registered, or was registered with a different hash. " +
        "Try regenerating the API key in the Flutter app and updating ~/.claude/mcp.json.";
      return res.status(200).json(diagnostics);
    }

    const keyData = keyDoc.data();
    if (!keyData || typeof keyData.userId !== "string") {
      diagnostics.failureReason = "validation_error";
      diagnostics.hint = "The apiKeys document exists but has no valid userId field.";
      return res.status(200).json(diagnostics);
    }

    // Mask userId (show first 4 + last 4)
    const userId = keyData.userId;
    diagnostics.userId =
      userId.length > 8 ? `${userId.slice(0, 4)}...${userId.slice(-4)}` : userId;

    // Check users collection
    const userDoc = await db.doc(`users/${userId}`).get();
    diagnostics.usersDocExists = userDoc.exists;

    if (!userDoc.exists) {
      diagnostics.failureReason = "user_not_found";
      diagnostics.hint =
        "The apiKeys document points to a userId that doesn't exist in the users collection. " +
        "The user may have been deleted. Create a new account in the Flutter app.";
      return res.status(200).json(diagnostics);
    }

    const userData = userDoc.data();
    diagnostics.usersDocHashMatch = userData?.apiKeyHash === keyHash;

    if (!diagnostics.usersDocHashMatch) {
      diagnostics.failureReason = "key_regenerated";
      diagnostics.hint =
        "The users document exists but apiKeyHash doesn't match. " +
        "This means the API key was regenerated in the app. " +
        "Copy the new API key from the app and update ~/.claude/mcp.json.";
      return res.status(200).json(diagnostics);
    }

    // All checks passed
    diagnostics.failureReason = "success";
    diagnostics.hint = "API key is valid and properly registered. Authentication should work.";

    logger.info("Debug auth check successful", {
      userId: diagnostics.userId,
      action: "debug_auth_success",
    });

    return res.status(200).json(diagnostics);
  } catch (error) {
    logger.error("Debug auth error", {
      error: error instanceof Error ? error.message : String(error),
      action: "debug_auth_error",
    });

    diagnostics.failureReason = "validation_error";
    diagnostics.hint = `Firestore query error: ${error instanceof Error ? error.message : String(error)}`;
    return res.status(500).json(diagnostics);
  }
});

export { router as debugRouter };
