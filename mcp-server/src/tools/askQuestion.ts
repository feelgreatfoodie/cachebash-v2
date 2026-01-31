import { getFirestore, serverTimestamp } from "../firebase/client.js";
import { AuthContext } from "../auth/apiKeyValidator.js";
import { encryptQuestionData } from "../encryption/crypto.js";
import { AskQuestionSchema, type AskQuestionArgs } from "../validation/validators.js";

/**
 * Send a question to the user's mobile device
 * Messages are encrypted by default using the API key
 *
 * Writes to both /questions (legacy) and /messages (unified) collections
 */
export async function askQuestion(
  auth: AuthContext,
  rawArgs: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  // Validate input
  const args = AskQuestionSchema.parse(rawArgs);
  const db = getFirestore();
  const shouldEncrypt = args.encrypt !== false;

  // Create plaintext preview for notification display (50 chars max)
  const preview = args.question.length > 50
    ? args.question.substring(0, 47) + "..."
    : args.question;

  // Prepare base question data
  let questionData: Record<string, unknown> = {
    priority: args.priority || "normal",
    status: "pending",
    createdAt: serverTimestamp(),
    response: null,
    answeredAt: null,
    preview, // Unencrypted preview for notifications
  };

  if (shouldEncrypt) {
    // Encrypt sensitive fields
    const encryptedData = encryptQuestionData(
      {
        question: args.question,
        options: args.options,
        context: args.context,
      },
      auth.apiKey
    );
    questionData = {
      ...questionData,
      ...encryptedData,
    };
  } else {
    // Store unencrypted
    questionData = {
      ...questionData,
      question: args.question,
      options: args.options || null,
      context: args.context || null,
      encrypted: false,
    };
  }

  // Create question document in legacy collection
  const questionRef = await db
    .collection(`users/${auth.userId}/questions`)
    .add(questionData);

  const questionId = questionRef.id;

  // Also write to unified messages collection
  const messageData: Record<string, unknown> = {
    ...questionData,
    direction: "to_user",
    content: questionData.question, // Map question -> content (encrypted if enabled)
    archived: false,
    deletedAt: null,
  };
  // Remove duplicate field
  delete messageData.question;

  await db
    .collection(`users/${auth.userId}/messages`)
    .doc(questionId) // Use same ID for consistency
    .set(messageData);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          questionId,
          encrypted: shouldEncrypt,
          message: `Question sent to user's device${shouldEncrypt ? " (encrypted)" : ""}. Use get_response with questionId "${questionId}" to check for a response.`,
        }),
      },
    ],
  };
}
