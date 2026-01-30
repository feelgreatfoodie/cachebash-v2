import { createApp } from "../server";
import request from "supertest";

// Mock Firebase
jest.mock("../lib/firebase", () => ({
  initializeFirebase: jest.fn(),
  getFirestore: jest.fn(),
}));

describe("Health endpoint", () => {
  const app = createApp();

  it("GET /v1/health returns 200 with status ok", async () => {
    const response = await request(app).get("/v1/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
      version: "1.0.0",
    });
  });

  it("responds within 100ms", async () => {
    const start = Date.now();
    await request(app).get("/v1/health");
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(100);
  });
});
