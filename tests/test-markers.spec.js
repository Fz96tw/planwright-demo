import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import config from "../playwright.config.js";

// These tests check the suite itself: which markers its test titles carry.
// `--list` collects the same tests `npm test` runs without running them, starting the server or writing a report.
// Titles here avoid the marker strings they look for, so neither test can satisfy its own check.

const originalInvariants = ["auth-required", "user-isolation", "audit-append-only", "no-error-leak"];

async function listedTitles() {
  const { stdout } = await promisify(execFile)("npx", ["playwright", "test", "--list", "--reporter=json"]);
  const titles = [];
  const walk = (suite) => {
    titles.push(...(suite.specs ?? []).map((s) => s.title));
    (suite.suites ?? []).forEach(walk);
  };
  JSON.parse(stdout).suites.forEach(walk);
  return titles;
}

const missingFrom = (titles, markers) => markers.filter((m) => !titles.some((t) => t.includes(m)));

test("[AC:59033e6e:ac_6] [AC:dcbaebca:ac_1] each delete-note criterion and each original invariant has a tagged test", async () => {
  test.setTimeout(60_000);
  const deleteNoteMarkers = [1, 2, 3, 4, 5].map((n) => `[AC:59033e6e:ac_${n}]`);
  const invariantMarkers = originalInvariants.map((id) => `[INV:${id}]`);

  expect(missingFrom(await listedTitles(), [...deleteNoteMarkers, ...invariantMarkers])).toEqual([]);
});

test("[AC:bf7d313b:ac_5] [AC:dcbaebca:ac_2] npm test writes test-results/report.json and runs a test for each original invariant", async () => {
  test.setTimeout(60_000);
  expect(config.reporter).toContainEqual(["json", { outputFile: "test-results/report.json" }]);
  expect(missingFrom(await listedTitles(), originalInvariants.map((id) => `[INV:${id}]`))).toEqual([]);
});
