import { describe, expect, test } from "vitest";
import { encodeCrosshairCode, parseCrosshairCode, readProfile } from "../utils/crosshair";

// A realistic primary-only code (cyan, no outline, inner lines tweaked,
// outer lines hidden). Verified shape against codes shared in community
// crosshair-collection threads.
const PRIMARY_ONLY = "0;P;c;5;h;0;0t;1;0l;3;0o;2;0a;1;0f;0;1t;1;1l;2;1o;3;1a;0.35;1m;0;1f;0;1b;0";

const CUSTOM_COLOR = "0;P;c;8;u;FF66CCFF;h;1;t;2;o;0.8;d;1;z;3;a;0.9;0b;1;0t;1;0l;4;0o;2;0a;1";

const MULTI_SECTION = "0;P;c;5;0l;3;A;c;7;0l;2;S;c;1;d;1";

describe("parseCrosshairCode", () => {
  test("parses a primary-only code into a typed object", () => {
    const r = parseCrosshairCode(PRIMARY_ONLY);
    expect(r.version).toBe("0");
    expect(r.primary).toBeTruthy();
    expect(r.ads).toBeNull();
    expect(r.sniper).toBeNull();
    expect(r.primary.c).toBe("5");
    expect(r.primary.h).toBe("0");
    expect(r.primary["0l"]).toBe("3");
  });

  test("captures multi-section codes with overrides per profile", () => {
    const r = parseCrosshairCode(MULTI_SECTION);
    expect(r.primary.c).toBe("5");
    expect(r.primary["0l"]).toBe("3");
    expect(r.ads.c).toBe("7");
    expect(r.ads["0l"]).toBe("2");
    expect(r.sniper.c).toBe("1");
    expect(r.sniper.d).toBe("1");
  });

  test("preserves custom-color hex on c=8", () => {
    const r = parseCrosshairCode(CUSTOM_COLOR);
    expect(r.primary.c).toBe("8");
    expect(r.primary.u).toBe("FF66CCFF");
  });

  test("rejects empty / no-section input", () => {
    expect(parseCrosshairCode("")).toBeNull();
    expect(parseCrosshairCode(null)).toBeNull();
    expect(parseCrosshairCode(undefined)).toBeNull();
    expect(parseCrosshairCode("0")).toBeNull(); // version only, no profile
  });

  test("tolerates trailing semicolons and extra whitespace", () => {
    const r = parseCrosshairCode(" 0 ;P ;c;5; ;;");
    expect(r.primary.c).toBe("5");
  });

  test("dangling key without value is dropped, not crashing", () => {
    const r = parseCrosshairCode("0;P;c;5;orphan");
    expect(r.primary.c).toBe("5");
    expect(r.primary.orphan).toBeUndefined();
  });

  test("unknown keys round-trip — future patch fields aren't lost", () => {
    const r = parseCrosshairCode("0;P;c;5;futureField;42");
    expect(r.primary.futureField).toBe("42");
    expect(encodeCrosshairCode(r)).toContain("futureField;42");
  });
});

describe("encodeCrosshairCode", () => {
  test("primary-only round-trip is byte-stable", () => {
    const r = parseCrosshairCode(PRIMARY_ONLY);
    expect(encodeCrosshairCode(r)).toBe(PRIMARY_ONLY);
  });

  test("multi-section round-trip is byte-stable", () => {
    const r = parseCrosshairCode(MULTI_SECTION);
    expect(encodeCrosshairCode(r)).toBe(MULTI_SECTION);
  });

  test("custom-color round-trip preserves the hex", () => {
    const r = parseCrosshairCode(CUSTOM_COLOR);
    expect(encodeCrosshairCode(r)).toBe(CUSTOM_COLOR);
  });

  test("null / empty input encodes to empty string", () => {
    expect(encodeCrosshairCode(null)).toBe("");
    expect(encodeCrosshairCode(undefined)).toBe("");
  });
});

describe("readProfile", () => {
  test("maps known fields to typed values with defaults", () => {
    const r = parseCrosshairCode(PRIMARY_ONLY);
    const p = readProfile(r.primary);
    expect(p.color).toBe("#00FFFF"); // 5 = cyan in our preset list
    expect(p.outline.show).toBe(false);
    expect(p.inner.thickness).toBe(1);
    expect(p.inner.length).toBe(3);
    expect(p.inner.offset).toBe(2);
    expect(p.outer.show).toBe(false);
  });

  test("c=8 reads the custom hex from `u`", () => {
    const r = parseCrosshairCode(CUSTOM_COLOR);
    const p = readProfile(r.primary);
    // RGBA in the code, RGB on canvas — strip the alpha component.
    expect(p.color).toBe("#FF66CC");
    expect(p.dot.show).toBe(true);
    expect(p.outline.show).toBe(true);
  });

  test("missing fields fall back to defaults rather than NaN", () => {
    const r = parseCrosshairCode("0;P;c;5");
    const p = readProfile(r.primary);
    expect(p.inner.length).toBe(4); // default
    expect(p.outline.opacity).toBe(0.5);
    expect(Number.isFinite(p.inner.thickness)).toBe(true);
  });

  test("null section yields null (caller can fall back to primary)", () => {
    expect(readProfile(null)).toBeNull();
  });

  test("malformed custom hex degrades to white", () => {
    const r = parseCrosshairCode("0;P;c;8;u;not-a-hex");
    const p = readProfile(r.primary);
    expect(p.color).toBe("#FFFFFF");
  });
});
