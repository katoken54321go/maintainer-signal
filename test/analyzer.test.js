import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { analyzeRepository } from "../src/analyzer.js";
import { evaluateHealthGate, parseArgs } from "../src/cli.js";
import { renderMarkdown } from "../src/report.js";

test("parseArgs reads common options", () => {
  const options = parseArgs(["--repo", "demo", "--repo-label", "owner/demo", "--github-repo", "owner/demo", "--format", "json", "--since-days", "30", "--strict", "--fail-under", "80"]);

  assert.equal(options.repo, "demo");
  assert.equal(options.repoLabel, "owner/demo");
  assert.equal(options.githubRepo, "owner/demo");
  assert.equal(options.format, "json");
  assert.equal(options.sinceDays, 30);
  assert.equal(options.strict, true);
  assert.equal(options.failUnder, 80);
});

test("analyzeRepository collects public GitHub signals with injected fetch", async () => {
  const responses = new Map([
    ["https://api.github.com/repos/example/demo", {
      default_branch: "main",
      description: "Demo repo",
      forks_count: 2,
      html_url: "https://github.com/example/demo",
      license: { spdx_id: "MIT" },
      name: "demo",
      open_issues_count: 3,
      stargazers_count: 10,
      topics: ["oss"],
      watchers_count: 4
    }],
    ["https://api.github.com/repos/example/demo/git/trees/main?recursive=1", {
      tree: [
        { path: "README.md", type: "blob" },
        { path: "LICENSE", type: "blob" },
        { path: ".github/workflows/ci.yml", type: "blob" },
        { path: "package.json", type: "blob", sha: "pkg" }
      ]
    }],
    ["https://api.github.com/repos/example/demo/git/blobs/pkg", {
      content: Buffer.from(JSON.stringify({ scripts: { test: "node --test" } })).toString("base64"),
      encoding: "base64"
    }],
    ["https://api.github.com/repos/example/demo/commits?since=2026-03-01T00%3A00%3A00.000Z&per_page=100", [
      { sha: "abc", commit: { author: { date: "2026-05-01T00:00:00Z", name: "A" }, message: "Initial commit\n\nbody" } }
    ]],
    ["https://api.github.com/repos/example/demo/tags?per_page=100", [{ name: "v1.0.0" }]],
    ["https://api.github.com/repos/example/demo/releases/latest", { tag_name: "v1.0.0", published_at: "2026-05-02T00:00:00Z" }]
  ]);
  const realDate = Date;
  global.Date = class extends realDate {
    constructor(...args) {
      return args.length === 0 ? new realDate("2026-05-30T00:00:00Z") : new realDate(...args);
    }
    static now() {
      return new realDate("2026-05-30T00:00:00Z").getTime();
    }
  };

  try {
    const fetchImpl = async (url) => {
      assert.equal(url.startsWith("https://api.github.com/"), true);
      const body = responses.get(url);
      return {
        ok: body !== undefined,
        status: body === undefined ? 404 : 200,
        json: async () => body
      };
    };
    const report = await analyzeRepository({ fetchImpl, githubRepo: "example/demo", sinceDays: 90 });

    assert.equal(report.repositoryLabel, "github.com/example/demo");
    assert.equal(report.github.stars, 10);
    assert.equal(report.files.readme, true);
    assert.deepEqual(report.automation.githubActions, [".github/workflows/ci.yml"]);
    assert.equal(report.git.latestCommit.subject, "Initial commit");
    assert.equal(report.git.recentCommitCountCapped, false);
  } finally {
    global.Date = realDate;
  }
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

test("evaluateHealthGate fails strict mode when recommendations remain", () => {
  const report = {
    score: { percent: 92 },
    recommendations: ["Add CI."]
  };

  assert.equal(evaluateHealthGate(report, { strict: true, failUnder: null }).ok, false);
  assert.equal(evaluateHealthGate(report, { strict: false, failUnder: 90 }).ok, true);
  assert.equal(evaluateHealthGate(report, { strict: false, failUnder: 95 }).ok, false);
});
