import { describe, expect, test } from "vitest";
import { MODE_NAMES } from "../utils/gameMode";

// Smoke coverage so the dedup pass in PR 2 (PartyPage.jsx re-declares
// MODE_NAMES inline) doesn't accidentally drop a key during the merge.
// If a key is removed here intentionally, update both this test and the
// PartyPage usage in the same commit.
describe("MODE_NAMES", () => {
  test("covers every queue the app currently surfaces", () => {
    const required = [
      "competitive",
      "unrated",
      "deathmatch",
      "spikerush",
      "swiftplay",
      "ggteam",
      "hurm",
      "premier",
      "snowball",
      "onefa",
      "skirmish2v2",
      "skirmishascension1v1",
      "skirmishascension2v2",
      "valaram",
      "dodgeball",
      "custom",
    ];
    for (const key of required) {
      expect(MODE_NAMES[key]).toBeTruthy();
    }
  });

  test("every value is a non-empty display string", () => {
    for (const [key, value] of Object.entries(MODE_NAMES)) {
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
      expect(value).not.toBe(key);
    }
  });
});
