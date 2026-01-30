import { createApp } from "./server";
import { config } from "./config";
import { initializeFirebase } from "./lib/firebase";
import { logger } from "./lib/logger";
import { closeAllConnections, getConnectionCount } from "./routes/sse";

const SHUTDOWN_GRACE_PERIOD_MS = 5000;

const app = createApp();

// Initialize Firebase
initializeFirebase();

// Start server
const server = app.listen(config.PORT, () => {
  logger.info("Server started", {
    port: config.PORT,
    env: config.NODE_ENV,
  });
});

// Track if we're shutting down
let isShuttingDown = false;

// Graceful shutdown handler
async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    logger.info("Shutdown already in progress", { signal });
    return;
  }

  isShuttingDown = true;
  const connectionCount = getConnectionCount();

  logger.info("Graceful shutdown initiated", {
    signal,
    activeConnections: connectionCount,
    gracePeriodMs: SHUTDOWN_GRACE_PERIOD_MS,
  });

  // Notify all SSE clients that the server is restarting
  if (connectionCount > 0) {
    logger.info("Notifying SSE clients of shutdown");
    closeAllConnections("server-restarting");
  }

  // Wait for grace period to allow clients to receive the notification
  await new Promise((resolve) => setTimeout(resolve, SHUTDOWN_GRACE_PERIOD_MS));

  // Close the HTTP server
  server.close((err) => {
    if (err !== undefined) {
      logger.error("Error closing server", {
        error: err.message,
      });
      process.exit(1);
    }

    logger.info("Server closed successfully");
    process.exit(0);
  });

  // Force exit after additional timeout if server.close hangs
  setTimeout(() => {
    logger.warn("Forced shutdown after timeout");
    process.exit(1);
  }, SHUTDOWN_GRACE_PERIOD_MS * 2);
}

// Handle shutdown signals
process.on("SIGTERM", () => {
  void gracefulShutdown("SIGTERM");
});

process.on("SIGINT", () => {
  void gracefulShutdown("SIGINT");
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", {
    error: error.message,
    stack: error.stack,
  });
  void gracefulShutdown("uncaughtException");
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection", {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
  void gracefulShutdown("unhandledRejection");
});
