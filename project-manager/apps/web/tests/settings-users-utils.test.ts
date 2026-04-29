import test from "node:test";
import assert from "node:assert/strict";
import {
  formatUserDisplayName,
  normalizeTagsInput,
  parseTeamTags,
  toggleSelectedIds,
  type SettingsAdminUser,
} from "@/lib/settings-users-utils";

test("parseTeamTags: invalid json returns empty", () => {
  assert.deepEqual(parseTeamTags("not-json"), []);
});

test("parseTeamTags: normalizes and trims", () => {
  assert.deepEqual(parseTeamTags('[" Sales ","TOKYO",""]'), ["sales", "tokyo"]);
});

test("normalizeTagsInput: dedup and lowercase", () => {
  assert.deepEqual(normalizeTagsInput("sales, tokyo,Sales, ,TOKYO"), ["sales", "tokyo"]);
});

test("toggleSelectedIds: add and remove", () => {
  assert.deepEqual(toggleSelectedIds([1, 2], 3, true), [1, 2, 3]);
  assert.deepEqual(toggleSelectedIds([1, 2, 3], 2, false), [1, 3]);
});

test("formatUserDisplayName: fallback to user id", () => {
  const user: SettingsAdminUser = {
    id: 15,
    email: "foo@example.com",
    display_name: null,
    team: null,
    is_admin: 0,
    created_at: null,
    updated_at: null,
  };
  assert.equal(formatUserDisplayName(user), "user#15");
});

