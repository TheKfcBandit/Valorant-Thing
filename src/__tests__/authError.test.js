import { describe, expect, test } from "vitest";
import { AUTH_REFRESHING, formatError, isTransientAuthError } from "../utils/authError";

describe("authError", () => {
  test("AUTH_REFRESHING constant matches the Rust contract", () => {
    // Hardcoded; the Rust side has the same literal in
    // src-tauri/src/riot/pd_session.rs. Don't change either half in
    // isolation.
    expect(AUTH_REFRESHING).toBe("AUTH_REFRESHING");
  });

  test("isTransientAuthError recognizes the string form", () => {
    expect(isTransientAuthError("AUTH_REFRESHING")).toBe(true);
  });

  test("isTransientAuthError recognizes the Error form Tauri returns", () => {
    expect(isTransientAuthError(new Error("AUTH_REFRESHING"))).toBe(true);
  });

  test("isTransientAuthError tolerates the sentinel as substring", () => {
    // The wrapper currently returns the bare sentinel, but tolerate the
    // case where a future wrapper-of-wrapper adds context.
    expect(isTransientAuthError("AUTH_REFRESHING: from /mmr/v1/...")).toBe(true);
  });

  test("isTransientAuthError ignores unrelated errors", () => {
    expect(isTransientAuthError("Not connected")).toBe(false);
    expect(isTransientAuthError(new Error("Failed to fetch"))).toBe(false);
    expect(isTransientAuthError(null)).toBe(false);
    expect(isTransientAuthError(undefined)).toBe(false);
  });

  test("formatError substitutes a friendly message for the sentinel", () => {
    expect(formatError("AUTH_REFRESHING", "fallback")).toBe("Refreshing session…");
    expect(formatError(new Error("AUTH_REFRESHING"), "fallback")).toBe("Refreshing session…");
  });

  test("formatError preserves non-auth errors", () => {
    expect(formatError("Not connected", "fallback")).toBe("Not connected");
    expect(formatError(new Error("Failed to fetch"), "fallback")).toBe("Failed to fetch");
  });

  test("formatError falls back when no message is present", () => {
    expect(formatError({}, "fallback")).toBe("fallback");
    expect(formatError(null, "fallback")).toBe("fallback");
    expect(formatError(undefined, "fallback")).toBe("fallback");
  });
});
