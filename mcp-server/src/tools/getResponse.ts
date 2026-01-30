import { getFirestore } from "../firebase/client.js";
import { AuthContext } from "../auth/apiKeyValidator.js";
import { decrypt, isEncrypted } from "../encryption/crypto.js";

interface GetResponseArgs {
  questionId: string;
}

/**
 * Check if the user has responded to a question
 * Automatically decrypts encrypted responses
 */
export async function getResponse(
  auth: AuthContext,
  args: GetResponseArgs
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const db = getFirestore();

  const questionDoc = await db
    .doc(`users/${auth.userId}/questions/${args.questionId}`)
    .get();

  if (!questionDoc.exists) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            error: "Question not found",
          }),
        },
      ],
    };
  }

  const data = questionDoc.data();

  if (data?.status === "answered" && data?.response) {
    let response = data.response;

    // Decrypt response if it's encrypted
    if (data?.responseEncrypted || (data?.encrypted && isEncrypted(response))) {
      try {
        response = decrypt(response, auth.apiKey);
      } catch (error) {
        console.error("Failed to decrypt response:", error);
        // Return encrypted response with warning
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                answered: true,
                response: response,
                encrypted: true,
                decryptionFailed: true,
                answeredAt: data.answeredAt?.toDate?.()?.toISOString() || null,
              }),
            },
          ],
        };
      }
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            answered: true,
            response: response,
            answeredAt: data.answeredAt?.toDate?.()?.toISOString() || null,
          }),
        },
      ],
    };
  }

  if (data?.status === "expired") {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            answered: false,
            expired: true,
            message: "Question has expired without a response",
          }),
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          answered: false,
          status: data?.status || "pending",
          message: "Waiting for user response",
        }),
      },
    ],
  };
}
