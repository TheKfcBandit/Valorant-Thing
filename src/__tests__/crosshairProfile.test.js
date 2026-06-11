import { describe, expect, test } from "vitest";
import { crosshairCodeToRiotProfile, CROSSHAIR_COLOR_RGB } from "../utils/crosshairProfile";

// Same fixtures as crosshair.test.js so the two layers stay in sync.
const PRIMARY_ONLY = "0;P;c;5;h;0;0t;1;0l;3;0o;2;0a;1;0f;0;1t;1;1l;2;1o;3;1a;0.35;1m;0;1f;0;1b;0";
const CUSTOM_COLOR = "0;P;c;8;u;FF66CCFF;h;1;t;2;o;0.8;d;1;z;3;a;0.9;0b;1;0t;1;0l;4;0o;2;0a;1";
const MULTI_SECTION = "0;P;c;5;0l;3;A;c;7;0l;2;S;c;1;d;1";

describe("crosshairCodeToRiotProfile", () => {
  test("minimal code produces a complete profile at game defaults", () => {
    const p = crosshairCodeToRiotProfile("0;P;c;0", "Default");
    expect(p.ProfileName).toBe("Default");
    expect(p.bUseAdvancedOptions).toBe(false);
    expect(p.bUsePrimaryCrosshairForADS).toBe(true);
    expect(p.Primary.Color).toEqual({ R: 255, G: 255, B: 255, A: 255 });
    expect(p.Primary.bHasOutline).toBe(true);
    expect(p.Primary.bDisplayCenterDot).toBe(false);
    expect(p.Primary.InnerLines.LineLength).toBe(6);
    expect(p.Primary.InnerLines.bShowLines).toBe(true);
    expect(p.Primary.OuterLines.LineOffset).toBe(10);
    expect(p.Sniper.bDisplayCenterDot).toBe(true);
    expect(p.aDS).toEqual(p.Primary);
  });

  test("primary-only fixture maps tweaked fields", () => {
    const p = crosshairCodeToRiotProfile(PRIMARY_ONLY, "Cyan");
    expect(p.Primary.Color).toEqual({ R: 0, G: 255, B: 255, A: 255 });
    expect(p.Primary.bHasOutline).toBe(false);
    expect(p.Primary.bFadeCrosshairWithFiringError).toBe(true); // no bare `f` key — default
    expect(p.Primary.InnerLines.LineThickness).toBe(1);
    expect(p.Primary.InnerLines.LineLength).toBe(3);
    expect(p.Primary.InnerLines.VLineLength).toBe(3);
    expect(p.Primary.InnerLines.LineOffset).toBe(2);
    expect(p.Primary.InnerLines.bShowShootingError).toBe(false);
    expect(p.Primary.OuterLines.bShowLines).toBe(false);
    expect(p.Primary.OuterLines.bShowMovementError).toBe(false);
  });

  test("custom hex (c=8) maps RGBA components", () => {
    const p = crosshairCodeToRiotProfile(CUSTOM_COLOR, "Pink");
    expect(p.Primary.Color).toEqual({ R: 255, G: 102, B: 204, A: 255 });
    expect(p.Primary.bDisplayCenterDot).toBe(true);
    expect(p.Primary.CenterDotSize).toBe(3);
    expect(p.Primary.CenterDotOpacity).toBe(0.9);
    expect(p.Primary.OutlineThickness).toBe(2);
    expect(p.Primary.OutlineOpacity).toBe(0.8);
  });

  test("A/S sections map to aDS and Sniper and imply advanced options", () => {
    const p = crosshairCodeToRiotProfile(MULTI_SECTION, "Multi");
    expect(p.bUseAdvancedOptions).toBe(true);
    expect(p.bUsePrimaryCrosshairForADS).toBe(false);
    expect(p.Primary.Color).toEqual({ R: 0, G: 255, B: 255, A: 255 });
    expect(p.aDS.Color).toEqual({ R: 255, G: 0, B: 0, A: 255 });
    expect(p.aDS.InnerLines.LineLength).toBe(2);
    expect(p.Sniper.CenterDotColor).toEqual({ R: 0, G: 255, B: 0, A: 255 });
    expect(p.Sniper.bDisplayCenterDot).toBe(true);
  });

  test("globals advanced flag is honored without A/S sections", () => {
    const p = crosshairCodeToRiotProfile("0;s;1;P;c;5", "Adv");
    expect(p.bUseAdvancedOptions).toBe(true);
    expect(p.bUsePrimaryCrosshairForADS).toBe(true);
  });

  test("unknown keys are ignored and never leak into the profile", () => {
    const p = crosshairCodeToRiotProfile("0;P;c;0;futureKey;9", "X");
    expect(JSON.stringify(p)).not.toContain("futureKey");
  });

  test("invalid input returns null", () => {
    expect(crosshairCodeToRiotProfile("", "X")).toBe(null);
    expect(crosshairCodeToRiotProfile("garbage", "X")).toBe(null);
    expect(crosshairCodeToRiotProfile(null, "X")).toBe(null);
  });

  test("profile structure matches the Riot blob shape exactly", () => {
    const p = crosshairCodeToRiotProfile("0;P;c;1", "Shape");
    expect(Object.keys(p).sort()).toEqual(
      [
        "ProfileName",
        "Primary",
        "Sniper",
        "aDS",
        "bUseAdvancedOptions",
        "bUsePrimaryCrosshairForADS",
      ].sort()
    );
    expect(Object.keys(p.Primary).sort()).toEqual(
      [
        "Color",
        "bHasOutline",
        "OutlineThickness",
        "OutlineColor",
        "OutlineOpacity",
        "bDisplayCenterDot",
        "CenterDotSize",
        "CenterDotOpacity",
        "bFadeCrosshairWithFiringError",
        "bFixMinErrorAcrossWeapons",
        "InnerLines",
        "OuterLines",
      ].sort()
    );
    expect(Object.keys(p.Primary.InnerLines).sort()).toEqual(
      [
        "LineThickness",
        "LineLength",
        "VLineLength",
        "bAllowVertScaling",
        "LineOffset",
        "Opacity",
        "bShowLines",
        "bShowMovementError",
        "bShowShootingError",
        "bShowMinError",
        "FiringErrorScale",
        "MovementErrorScale",
      ].sort()
    );
    expect(Object.keys(p.Sniper).sort()).toEqual(
      ["CenterDotColor", "bDisplayCenterDot", "CenterDotSize", "CenterDotOpacity"].sort()
    );
  });

  test("palette has the eight exact preset colors", () => {
    expect(CROSSHAIR_COLOR_RGB).toHaveLength(8);
    expect(CROSSHAIR_COLOR_RGB[3]).toBe("DFFF00");
    expect(CROSSHAIR_COLOR_RGB[7]).toBe("FF0000");
  });
});
