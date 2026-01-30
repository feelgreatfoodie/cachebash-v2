import { Router, Request, Response } from "express";
import { version } from "../../package.json";

const router = Router();

interface HealthResponse {
  status: "ok";
  version: string;
}

router.get("/health", (_req: Request, res: Response<HealthResponse>) => {
  res.json({
    status: "ok",
    version,
  });
});

export { router as healthRouter };
