import { describe, expect, it } from "vitest";
import { configSchema } from "../../src/config/schema.js";

describe("config schema", () => {
  it("accepts a minimal spec", () => {
    const parsed = configSchema.safeParse({
      steps: [{ type: "wait", ms: 1 }],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects duplicate screenshot names", () => {
    const parsed = configSchema.safeParse({
      steps: [
        { type: "screenshot", name: "same" },
        { type: "screenshot", name: "same" },
      ],
    });
    expect(parsed.success).toBe(false);
  });
});

