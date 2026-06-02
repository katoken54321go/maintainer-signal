import { execFile } from "node:child_process";
import { access, readFile, readdir, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function analyzeRepository({ repoPath = ".", sinceDays = 90 } = {}) {
  const root = resolve(repoPath);
  const projectName = await detectProjectName(root);
  const files = await collectFileSignals(root);
  const git = await collectGitSignals(root, sinceDays);
  const automation = await collectAutomationSignals(root);

  return {
    generatedAt: new Date().toISOString(),
    projectName,
    root,
    sinceDays,
    files,
    git,
    automation,
    score: scoreSignals({ files, git, automation }),
    recommendations: buildRecommendations({ files, git, automation })
  };
}

async function detectProjectName(root) {
  const packageJson = await readJsonIfExists(join(root, "package.json"));
  return packageJson?.name ?? basename(root);
}

async function collectFileSignals(root) {
  return {
    readme: await existsAny(root, ["README.md", "readme.md"]),
    license: await existsAny(root, ["LICENSE", "LICENSE.md", "license.md"]),
    contributing: await existsAny(root, ["CONTRIBUTING.md", ".github/CONTRIBUTING.md"]),
    codeOfConduct: await existsAny(root, ["CODE_OF_CONDUCT.md", ".github/CODE_OF_CONDUCT.md"]),
    security: await existsAny(root, ["SECURITY.md", ".github/SECURITY.md"]),
    changelog: await existsAny(root, ["CHANGELOG.md", "docs/CHANGELOG.md"]),
    issueTemplates: await directoryHasFiles(join(root, ".github", "ISSUE_TEMPLATE")),
    codexGuidance: await existsAny(root, ["AGENTS.md", ".codex/AGENTS.md"])
  };
}

async function collectGitSignals(root, sinceDays) {
  const isRepo = await runGit(root, ["rev-parse", "--is-inside-work-tree"]);
  if (isRepo.exitCode !== 0 || isRepo.stdout.trim() !== "true") {
    return {
      available: false,
      recentCommitCount: null,
      latestCommit: null,
      tagCount: null
    };
  }

  const since = `${sinceDays} days ago`;
  const log = await runGit(root, [
    "log",
    `--since=${since}`,
    "--pretty=%H%x09%an%x09%ad%x09%s",
    "--date=short"
  ]);
  const commits = log.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha, author, date, ...subjectParts] = line.split("\t");
      return { sha, author, date, subject: subjectParts.join("\t") };
    });

  const tags = await runGit(root, ["tag", "--list"]);

  return {
    available: true,
    recentCommitCount: commits.length,
    latestCommit: commits[0] ?? null,
    tagCount: tags.stdout.split("\n").filter(Boolean).length
  };
}

async function collectAutomationSignals(root) {
  const workflowsDir = join(root, ".github", "workflows");
  const workflowFiles = await listFiles(workflowsDir);
  const packageJson = await readJsonIfExists(join(root, "package.json"));

  return {
    githubActions: workflowFiles.filter((file) => file.endsWith(".yml") || file.endsWith(".yaml")),
    testScript: packageJson?.scripts?.test ?? null,
    checkScript: packageJson?.scripts?.check ?? null
  };
}

function scoreSignals({ files, git, automation }) {
  const checks = [
    files.readme,
    files.license,
    files.contributing,
    files.codeOfConduct,
    files.security,
    files.issueTemplates,
    files.codexGuidance,
    automation.githubActions.length > 0,
    Boolean(automation.testScript),
    git.available && git.recentCommitCount > 0
  ];
  const passed = checks.filter(Boolean).length;

  return {
    passed,
    total: checks.length,
    percent: Math.round((passed / checks.length) * 100)
  };
}

function buildRecommendations({ files, git, automation }) {
  const recommendations = [];

  if (!files.readme) recommendations.push("Add a README that explains users, installation, examples, and maintenance goals.");
  if (!files.license) recommendations.push("Add an OSI-approved license so others can use and contribute safely.");
  if (!files.contributing) recommendations.push("Add CONTRIBUTING.md with local setup, test commands, and contribution scope.");
  if (!files.security) recommendations.push("Add SECURITY.md with a vulnerability reporting path.");
  if (!files.issueTemplates) recommendations.push("Add issue templates to make bug reports and feature requests easier to triage.");
  if (!files.codexGuidance) recommendations.push("Add AGENTS.md so Codex and other agents know how to work in the repository.");
  if (automation.githubActions.length === 0) recommendations.push("Add a GitHub Actions workflow that runs checks on pull requests.");
  if (!automation.testScript) recommendations.push("Add a test script, even if the first version uses a small smoke test.");
  if (!git.available) recommendations.push("Initialize a git repository before publishing to GitHub.");
  if (git.available && git.recentCommitCount === 0) recommendations.push("Make regular commits so maintenance activity is visible.");

  return recommendations;
}

async function existsAny(root, relativePaths) {
  for (const relativePath of relativePaths) {
    if (await fileExists(join(root, relativePath))) {
      return true;
    }
  }
  return false;
}

async function fileExists(path) {
  try {
    const result = await stat(path);
    return result.isFile();
  } catch {
    return false;
  }
}

async function directoryHasFiles(path) {
  const files = await listFiles(path);
  return files.length > 0;
}

async function listFiles(path) {
  try {
    await access(path);
    return await readdir(path);
  } catch {
    return [];
  }
}

async function readJsonIfExists(path) {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function runGit(cwd, args) {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, { cwd });
    return { exitCode: 0, stdout, stderr };
  } catch (error) {
    return {
      exitCode: typeof error.code === "number" ? error.code : 1,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? error.message
    };
  }
}
