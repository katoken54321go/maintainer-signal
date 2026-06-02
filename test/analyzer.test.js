import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { analyzeRepository } from "../src/analyzer.js";
import { parseArgs } from "../src/cli.js";
import { renderMarkdown } from "../src/report.js";

test("parseArgs reads common options", () => {
  const options = parseArgs(["--repo", "demo", "--repo-label", "owner/demo", "--format", "json", "--since-days", "30"]);

  assert.equal(options.repo, "demo");
  assert.equal(options.repoLabel, "owner/demo");
  assert.equal(options.format, "json");
  assert.equal(options.sinceDays, 30);
});

test("analyzeRepository detects repository hygiene files", async () => {
  const repo = await mkdtemp(join(tmpdir(), "maintainer-signal-"));
  await mkdir(join(repo, ".github", "ISSUE_TEMPLATE"), { recursive: true });
  await writeFile(join(repo, "package.json"), JSON.stringify({ name: "demo", scripts: { test: "node --test" } }));
  await writeFile(join(repo, "README.md"), "# demo\n");
  await writeFile(join(repo, "LICENSE"), "MIT\n");
  await writeFile(join(repo, ".github", "ISSUE_TEMPLATE", "bug_report.md"), "# Bug report\n");
  await writeFile(join(repo, ".github", "pull_request_template.md"), "# Pull request\n");
  await writeFile(join(repo, ".github", "CODEOWNERS"), "* @demo\n");
  await writeFile(join(repo, "SUPPORT.md"), "# Support\n");

  const report = await analyzeRepository({ repoPath: repo });

  assert.equal(report.projectName, "demo");
  assert.equal(report.files.readme, true);
  assert.equal(report.files.license, true);
  assert.equal(report.files.issueTemplates, true);
  assert.equal(report.files.pullRequestTemplate, true);
  assert.equal(report.files.codeowners, true);
  assert.equal(report.files.support, true);
  assert.equal(report.automation.testScript, "node --test");
});

test("renderMarkdown includes application evidence guidance", async () => {
  const report = await analyzeRepository({ repoPath: "." });
  const markdown = renderMarkdown(report);

  assert.match(markdown, /Application Evidence Draft/);
  assert.match(markdown, /Recommended Next Steps/);
});
