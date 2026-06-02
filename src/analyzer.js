import { execFile } from "node:child_process";
import { access, readFile, readdir, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const githubApiBase = "https://api.github.com";

export async function analyzeRepository({
  fetchImpl = globalThis.fetch,
  githubRepo = null,
  repoPath = ".",
  repoLabel = null,
  sinceDays = 90
} = {}) {
  if (githubRepo) {
    return analyzeGitHubRepository({ fetchImpl, githubRepo, repoLabel, sinceDays });
  }

  const root = resolve(repoPath);
  const projectName = await detectProjectName(root);
  const files = await collectFileSignals(root);
  const git = await collectGitSignals(root, sinceDays);
  const automation = await collectAutomationSignals(root);

  return {
    generatedAt: new Date().toISOString(),
    projectName,
    repositoryLabel: repoLabel,
    root,
    sinceDays,
    files,
    git,
    automation,
    score: scoreSignals({ files, git, automation }),
    recommendations: buildRecommendations({ files, git, automation })
  };
}

async function analyzeGitHubRepository({ fetchImpl, githubRepo, repoLabel, sinceDays }) {
  if (typeof fetchImpl !== "function") {
    throw new Error("GitHub analysis requires a fetch implementation.");
  }

  const fullName = normalizeGitHubRepo(githubRepo);
  const repo = await githubJson(fetchImpl, `/repos/${fullName}`);
  const defaultBranch = repo.default_branch ?? "main";
  const tree = await githubJson(fetchImpl, `/repos/${fullName}/git/trees/${encodeURIComponent(defaultBranch)}?recursive=1`);
  const treeItems = Array.isArray(tree.tree) ? tree.tree : [];
  const paths = new Set(treeItems.map((item) => item.path.toLowerCase()));
  const packageJson = await readGitHubPackageJson(fetchImpl, fullName, treeItems);
  const commits = await githubJson(fetchImpl, `/repos/${fullName}/commits?since=${encodeURIComponent(sinceDate(sinceDays))}&per_page=100`);
  const tags = await githubJson(fetchImpl, `/repos/${fullName}/tags?per_page=100`);
  const latestRelease = await githubJson(fetchImpl, `/repos/${fullName}/releases/latest`, { allowMissing: true });

  const files = collectGitHubFileSignals(paths);
  const git = {
    available: true,
    recentCommitCount: Array.isArray(commits) ? commits.length : 0,
    recentCommitCountCapped: Array.isArray(commits) && commits.length === 100,
    latestCommit: Array.isArray(commits) && commits[0] ? {
      sha: commits[0].sha,
      author: commits[0].commit?.author?.name ?? commits[0].author?.login ?? "unknown",
      date: commits[0].commit?.author?.date?.slice(0, 10) ?? "unknown",
      subject: firstLine(commits[0].commit?.message ?? "")
    } : null,
    tagCount: Array.isArray(tags) ? tags.length : 0,
    tagCountCapped: Array.isArray(tags) && tags.length === 100
  };
  const automation = {
    githubActions: [...paths].filter((path) => path.startsWith(".github/workflows/") && (path.endsWith(".yml") || path.endsWith(".yaml"))),
    testScript: packageJson?.scripts?.test ?? null,
    checkScript: packageJson?.scripts?.check ?? null
  };

  return {
    generatedAt: new Date().toISOString(),
    projectName: repo.name ?? fullName.split("/")[1],
    repositoryLabel: repoLabel ?? `github.com/${fullName}`,
    root: null,
    sinceDays,
    files,
    git,
    automation,
    github: {
      fullName,
      htmlUrl: repo.html_url,
      description: repo.description,
      defaultBranch,
      stars: repo.stargazers_count ?? 0,
      forks: repo.forks_count ?? 0,
      openIssues: repo.open_issues_count ?? 0,
      watchers: repo.subscribers_count ?? repo.watchers_count ?? 0,
      topics: repo.topics ?? [],
      license: repo.license?.spdx_id ?? repo.license?.name ?? null,
      latestRelease: latestRelease ? {
        name: latestRelease.name,
        tagName: latestRelease.tag_name,
        publishedAt: latestRelease.published_at
      } : null
    },
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
    pullRequestTemplate: await existsAny(root, ["PULL_REQUEST_TEMPLATE.md", ".github/pull_request_template.md"]),
    support: await existsAny(root, ["SUPPORT.md", ".github/SUPPORT.md"]),
    codeowners: await existsAny(root, ["CODEOWNERS", ".github/CODEOWNERS", "docs/CODEOWNERS"]),
    codexGuidance: await existsAny(root, ["AGENTS.md", ".codex/AGENTS.md"])
  };
}

function collectGitHubFileSignals(paths) {
  return {
    readme: hasAnyPath(paths, ["readme.md", "readme"]),
    license: hasAnyPath(paths, ["license", "license.md", "copying", "copying.md"]),
    contributing: hasAnyPath(paths, ["contributing.md", ".github/contributing.md"]),
    codeOfConduct: hasAnyPath(paths, ["code_of_conduct.md", ".github/code_of_conduct.md"]),
    security: hasAnyPath(paths, ["security.md", ".github/security.md"]),
    changelog: hasAnyPath(paths, ["changelog.md", "docs/changelog.md"]),
    issueTemplates: hasPathPrefix(paths, ".github/issue_template/"),
    pullRequestTemplate: hasAnyPath(paths, ["pull_request_template.md", ".github/pull_request_template.md"]),
    support: hasAnyPath(paths, ["support.md", ".github/support.md"]),
    codeowners: hasAnyPath(paths, ["codeowners", ".github/codeowners", "docs/codeowners"]),
    codexGuidance: hasAnyPath(paths, ["agents.md", ".codex/agents.md"])
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
    files.pullRequestTemplate,
    files.support,
    files.codeowners,
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
  if (!files.pullRequestTemplate) recommendations.push("Add a pull request template so contributors know the expected validation steps.");
  if (!files.support) recommendations.push("Add SUPPORT.md so users know where to ask questions and where not to send secrets.");
  if (!files.codeowners) recommendations.push("Add CODEOWNERS to make review ownership explicit.");
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

function normalizeGitHubRepo(input) {
  const cleaned = input.replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/$/, "");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(cleaned)) {
    throw new Error("--github-repo must be in owner/name form.");
  }
  return cleaned;
}

async function githubJson(fetchImpl, path, { allowMissing = false } = {}) {
  const response = await fetchImpl(`${githubApiBase}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "maintainer-signal"
    }
  });

  if (allowMissing && response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`GitHub API request failed (${response.status}) for ${path}`);
  }

  return response.json();
}

async function readGitHubPackageJson(fetchImpl, fullName, treeItems) {
  const packageItem = treeItems.find((item) => item.path === "package.json" && item.type === "blob");
  if (!packageItem?.sha) {
    return null;
  }

  const blob = await githubJson(fetchImpl, `/repos/${fullName}/git/blobs/${packageItem.sha}`);
  if (blob.encoding !== "base64" || !blob.content) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(blob.content, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function sinceDate(sinceDays) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - sinceDays);
  return date.toISOString();
}

function firstLine(value) {
  return value.split("\n")[0] ?? "";
}

function hasAnyPath(paths, candidates) {
  return candidates.some((candidate) => paths.has(candidate));
}

function hasPathPrefix(paths, prefix) {
  for (const path of paths) {
    if (path.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}
