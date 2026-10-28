import { test, expect } from "@playwright/test";
import { exec } from "node:child_process";
import { readFile, rm } from "node:fs/promises";

// These tests check .planwright/verify.yml itself, running its `run` command as a nested Playwright run.
// The nested run writes test-results/report.json; the outer run rewrites it when it finishes.

const verifyYml = () => readFile(".planwright/verify.yml", "utf8");
const topLevel = (yml, key) => yml.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1].trim();

async function runWithGrep(grep) {
  const command = topLevel(await verifyYml(), "run").replace("{grep}", grep);
  await rm("test-results/report.json", { force: true });
  // The outer run's server is already up; CI would make the nested run try to start a second one.
  const { CI, ...env } = process.env;
  const code = await new Promise((resolve) => exec(command, { env }, (err) => resolve(err ? err.code : 0)));
  const report = JSON.parse(await readFile("test-results/report.json", "utf8"));
  const specs = [];
  const walk = (suite) => {
    specs.push(...(suite.specs ?? []));
    (suite.suites ?? []).forEach(walk);
  };
  report.suites.forEach(walk);
  return { code, report, specs };
}

test("[AC:abbc62b0:ac_1] verify.yml declares version, setup, run with {grep}, the playwright report and full", async () => {
  const yml = await verifyYml();
  expect(topLevel(yml, "version")).toBe("1");
  expect(topLevel(yml, "setup")).toBe("npm ci");
  expect(topLevel(yml, "run")).toContain("{grep}");
  expect(yml).toMatch(/^reports:\s*\n\s+-\s*\{\s*path:\s*test-results\/report\.json,\s*format:\s*playwright\s*\}/m);
  expect(topLevel(yml, "full")).toBe("npm test");
});

test("[AC:abbc62b0:ac_3] run with a marker regex runs only the matching tests and writes them to the report", async () => {
  test.setTimeout(60_000);
  const { code, specs } = await runWithGrep("\\[INV:(auth-required|user-isolation)\\]");

  expect(code).toBe(0);
  expect(specs.map((s) => s.title.match(/\[INV:([a-z-]+)\]/)?.[1]).sort()).toEqual(["auth-required", "user-isolation"]);
  expect(specs.every((s) => s.ok)).toBe(true);
});

test("[AC:abbc62b0:ac_4] run with a marker regex that matches nothing reports no tests as passing", async () => {
  test.setTimeout(60_000);
  const { code, report, specs } = await runWithGrep("\\[INV:no-such-marker\\]");

  expect(code).not.toBe(0);
  expect(specs).toEqual([]);
  expect(report.stats.expected).toBe(0);
});
