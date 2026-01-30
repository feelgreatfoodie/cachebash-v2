import { createApp } from "./server";
import { config } from "./config";
import { initializeFirebase } from "./lib/firebase";
import { logger } from "./lib/logger";

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

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
});
