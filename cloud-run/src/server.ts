import express, { Express, Request, Response, NextFunction } from "express";
import { healthRouter } from "./routes/health";
import { debugRouter } from "./routes/debug";
import { sseRouter } from "./routes/sse";
import { logger } from "./lib/logger";

export function createApp(): Express {
  const app = express();

  // Trust proxy for Cloud Run
  app.set("trust proxy", true);

  // Body parsing
  app.use(express.json());

  // Request logging
  app.use((req: Request, _res: Response, next: NextFunction) => {
    logger.info("Request received", {
      method: req.method,
      path: req.path,
      ip: req.ip,
    });
    next();
  });

  // Health routes (no auth required)
  app.use("/v1", healthRouter);

  // Debug routes (no auth required - for diagnostics)
  app.use("/v1", debugRouter);

  // SSE routes (auth required - handled by router)
  app.use("/v1", sseRouter);

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "Not found" });
  });

  // Error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error("Unhandled error", { error: err.message, stack: err.stack });
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
