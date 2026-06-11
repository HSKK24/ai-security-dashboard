import { afterEach, describe, expect, it, vi } from "vitest";
import { logger, maskSecrets } from "../../src/lib/logger";

describe("maskSecrets", () => {
  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
    vi.restoreAllMocks();
  });

  it("masks explicitly provided secrets", () => {
    expect(maskSecrets("key=abc123 other=abc123", ["abc123"])).toBe("key=*** other=***");
  });

  it("masks secrets sourced from environment variables", () => {
    process.env.GEMINI_API_KEY = "super-secret-value";
    expect(maskSecrets("calling with super-secret-value")).toBe("calling with ***");
  });

  it("returns the text unchanged when no secrets are set", () => {
    expect(maskSecrets("nothing to hide", [])).toBe("nothing to hide");
  });
});

describe("logger", () => {
  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
    vi.restoreAllMocks();
  });

  it("writes masked info logs to stdout", () => {
    process.env.GEMINI_API_KEY = "topsecret";
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("using key topsecret");
    expect(spy).toHaveBeenCalledTimes(1);
    const line = spy.mock.calls[0]?.[0] as string;
    expect(line).toContain("[INFO]");
    expect(line).toContain("***");
    expect(line).not.toContain("topsecret");
  });

  it("writes warnings to stdout and errors to stderr", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    logger.warn("a warning");
    logger.error("an error");
    expect(logSpy.mock.calls[0]?.[0]).toContain("[WARN]");
    expect(errorSpy.mock.calls[0]?.[0]).toContain("[ERROR]");
  });
});
