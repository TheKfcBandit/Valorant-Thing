import { describe, test, expect } from "vitest";
import {
  SAVED_CROSSHAIR_ENUM,
  MAX_CROSSHAIR_PROFILES,
  isFeatureUnavailable,
  readStringSetting,
  writeStringSetting,
  readCrosshairProfiles,
  appendCrosshairProfile,
} from "../utils/playerSettings";

const PROFILE = { ProfileName: "Test", Primary: {} };

function fixtureSettings(profileContainer) {
  return {
    stringSettings: [
      { settingEnum: "EAresStringSettingName::Other", value: "keep-me" },
      ...(profileContainer
        ? [{ settingEnum: SAVED_CROSSHAIR_ENUM, value: JSON.stringify(profileContainer) }]
        : []),
    ],
    boolSettings: [{ settingEnum: "EAresBoolSettingName::Foo", value: true }],
    floatSettings: [],
  };
}

describe("readStringSetting / writeStringSetting", () => {
  test("reads an existing entry, null when absent", () => {
    const s = fixtureSettings(null);
    expect(readStringSetting(s, "EAresStringSettingName::Other")).toBe("keep-me");
    expect(readStringSetting(s, SAVED_CROSSHAIR_ENUM)).toBe(null);
    expect(readStringSetting(undefined, SAVED_CROSSHAIR_ENUM)).toBe(null);
  });

  test("write replaces in place and leaves everything else untouched", () => {
    const s = fixtureSettings(null);
    const out = writeStringSetting(s, "EAresStringSettingName::Other", "new");
    expect(readStringSetting(out, "EAresStringSettingName::Other")).toBe("new");
    expect(out.boolSettings).toEqual(s.boolSettings);
    expect(out.floatSettings).toEqual(s.floatSettings);
    expect(s.stringSettings[0].value).toBe("keep-me");
  });

  test("write appends when the setting is missing", () => {
    const out = writeStringSetting(fixtureSettings(null), SAVED_CROSSHAIR_ENUM, "v");
    expect(out.stringSettings).toHaveLength(2);
    expect(readStringSetting(out, SAVED_CROSSHAIR_ENUM)).toBe("v");
  });
});

describe("readCrosshairProfiles", () => {
  test("summarizes an existing container", () => {
    const s = fixtureSettings({ CurrentProfile: 1, Profiles: [PROFILE, { ProfileName: "B" }] });
    expect(readCrosshairProfiles(s)).toEqual({
      currentProfile: 1,
      profileNames: ["Test", "B"],
      missing: false,
    });
  });

  test("missing setting reports missing, unparseable reports null", () => {
    expect(readCrosshairProfiles(fixtureSettings(null))).toEqual({
      currentProfile: 0,
      profileNames: [],
      missing: true,
    });
    const corrupt = writeStringSetting(fixtureSettings(null), SAVED_CROSSHAIR_ENUM, "not json");
    expect(readCrosshairProfiles(corrupt)).toBe(null);
  });
});

describe("appendCrosshairProfile", () => {
  test("appends, selects, and round-trips other settings untouched", () => {
    const s = fixtureSettings({ CurrentProfile: 0, Profiles: [{ ProfileName: "A" }] });
    const { settings: out, index } = appendCrosshairProfile(s, PROFILE);
    expect(index).toBe(1);
    const container = JSON.parse(readStringSetting(out, SAVED_CROSSHAIR_ENUM));
    expect(container.CurrentProfile).toBe(1);
    expect(container.Profiles).toHaveLength(2);
    expect(container.Profiles[1]).toEqual(PROFILE);
    expect(readStringSetting(out, "EAresStringSettingName::Other")).toBe("keep-me");
    expect(out.boolSettings).toEqual(s.boolSettings);
  });

  test("creates a fresh container when the account has none", () => {
    const { settings: out, index } = appendCrosshairProfile(fixtureSettings(null), PROFILE);
    expect(index).toBe(0);
    const container = JSON.parse(readStringSetting(out, SAVED_CROSSHAIR_ENUM));
    expect(container).toEqual({ CurrentProfile: 0, Profiles: [PROFILE] });
  });

  test("rejects at the profile cap", () => {
    const full = fixtureSettings({
      CurrentProfile: 0,
      Profiles: Array.from({ length: MAX_CROSSHAIR_PROFILES }, (_, i) => ({
        ProfileName: `p${i}`,
      })),
    });
    expect(() => appendCrosshairProfile(full, PROFILE)).toThrow(/full/);
  });

  test("refuses to overwrite an unparseable existing list", () => {
    const corrupt = writeStringSetting(fixtureSettings(null), SAVED_CROSSHAIR_ENUM, "{broken");
    expect(() => appendCrosshairProfile(corrupt, PROFILE)).toThrow(/not overwriting/);
  });
});

describe("isFeatureUnavailable", () => {
  test.each([
    ["/playerPref/v3/getPreference/Ares.PlayerSettings: HTTP 403 forbidden", true],
    ["/playerPref/v3/savePreference: HTTP 404 ", true],
    ["something: HTTP 401 unauthorized", false],
    ["something: HTTP 500 oops", false],
    ["AUTH_REFRESHING", false],
    ["HTTP 4031 weird", false],
    [null, false],
  ])("%s → %s", (msg, expected) => {
    expect(isFeatureUnavailable(msg)).toBe(expected);
  });
});
