import crypto from "crypto";

const SALT_PREFIX = "cachebash_e2e_v1_";
const KEY_ITERATIONS = 100000;
const KEY_LENGTH = 32; // 256 bits for AES-256
const IV_LENGTH = 16;
const ALGORITHM = "aes-256-cbc";

/**
 * Derive encryption key from API key using PBKDF2
 */
function deriveKey(apiKey: string): Buffer {
  // Create deterministic salt from API key hash
  const apiKeyHash = crypto.createHash("sha256").update(apiKey).digest("hex");
  const salt = SALT_PREFIX + apiKeyHash.substring(0, 16);

  return crypto.pbkdf2Sync(
    apiKey,
    salt,
    KEY_ITERATIONS,
    KEY_LENGTH,
    "sha256"
  );
}

/**
 * Decrypt ciphertext
 * Expects base64 encoded string with IV prepended
 */
export function decrypt(ciphertext: string, apiKey: string): string {
  const key = deriveKey(apiKey);
  const combined = Buffer.from(ciphertext, "base64");

  if (combined.length < IV_LENGTH + 1) {
    throw new Error("Ciphertext too short");
  }

  // Extract IV and ciphertext
  const iv = combined.subarray(0, IV_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString("utf8");
}

/**
 * Check if a string appears to be encrypted (base64 with proper length)
 */
export function isEncrypted(text: string | null | undefined): boolean {
  if (!text) return false;

  try {
    const decoded = Buffer.from(text, "base64");
    // Encrypted text should be at least IV (16) + 1 block (16) = 32 bytes
    return decoded.length >= 32;
  } catch {
    return false;
  }
}

/**
 * Decrypt task data if encrypted
 */
export function decryptTaskData(
  data: { title: string; instructions: string; action?: string; encrypted?: boolean },
  apiKey: string
): { title: string; instructions: string; action: string } {
  if (!data.encrypted) {
    return {
      title: data.title,
      instructions: data.instructions,
      action: data.action || "queue",
    };
  }

  try {
    return {
      title: isEncrypted(data.title) ? decrypt(data.title, apiKey) : data.title,
      instructions: isEncrypted(data.instructions)
        ? decrypt(data.instructions, apiKey)
        : data.instructions,
      action: data.action && isEncrypted(data.action)
        ? decrypt(data.action, apiKey)
        : data.action || "queue",
    };
  } catch (error) {
    console.error("Failed to decrypt task data:", error);
    return {
      title: data.title,
      instructions: data.instructions,
      action: data.action || "queue",
    };
  }
}
