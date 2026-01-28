import { getFirestore, serverTimestamp } from "../firebase/client.js";
import { AuthContext } from "../auth/apiKeyValidator.js";

interface AskQuestionArgs {
  question: string;
  options?: string[];
  priority?: "low" | "normal" | "high";
  context?: string;
}

/**
 * Send a question to the user's mobile device
 */
export async function askQuestion(
  auth: AuthContext,
  args: AskQuestionArgs
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const db = getFirestore();

  const questionData = {
    question: args.question,
    options: args.options || null,
    priority: args.priority || "normal",
    context: args.context || null,
    status: "pending",
    createdAt: serverTimestamp(),
    response: null,
    answeredAt: null,
  };

  // Create question document
  const questionRef = await db
    .collection(`users/${auth.userId}/questions`)
    .add(questionData);

  const questionId = questionRef.id;

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          questionId,
          message: `Question sent to user's device. Use get_response with questionId "${questionId}" to check for a response.`,
        }),
      },
    ],
  };
}
