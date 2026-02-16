import { validateTransition } from "../lifecycle/engine";

describe("Lifecycle Engine", () => {
  describe("task transitions", () => {
    it("allows created → active", () => {
      expect(validateTransition("task", "created", "active")).toBe(true);
    });

    it("requires completing before done", () => {
      expect(validateTransition("task", "active", "done")).toBe(false);
      expect(validateTransition("task", "active", "completing")).toBe(true);
      expect(validateTransition("task", "completing", "done")).toBe(true);
    });

    it("allows active → blocked → active", () => {
      expect(validateTransition("task", "active", "blocked")).toBe(true);
      expect(validateTransition("task", "blocked", "active")).toBe(true);
    });

    it("rejects invalid transitions", () => {
      expect(validateTransition("task", "done", "active")).toBe(false);
      expect(validateTransition("task", "created", "done")).toBe(false);
    });
  });

  describe("session transitions", () => {
    it("allows created → active for sessions", () => {
      expect(validateTransition("session", "created", "active")).toBe(true);
    });
  });
});
