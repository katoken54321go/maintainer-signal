export function renderMarkdown(report) {
  const lines = [
    `# Maintainer Signal: ${report.projectName}`,
    "",
    `Generated: ${report.generatedAt}`,
    `Repository: ${report.repositoryLabel ?? report.root}`,
    `Signal score: ${report.score.passed}/${report.score.total} (${report.score.percent}%)`,
    "",
    "## Repository Basics",
    "",
    table([
      ["README", mark(report.files.readme)],
      ["License", mark(report.files.license)],
      ["Contributing guide", mark(report.files.contributing)],
      ["Code of conduct", mark(report.files.codeOfConduct)],
      ["Security policy", mark(report.files.security)],
      ["Changelog", mark(report.files.changelog)],
      ["Issue templates", mark(report.files.issueTemplates)],
      ["Pull request template", mark(report.files.pullRequestTemplate)],
      ["Support policy", mark(report.files.support)],
      ["Code owners", mark(report.files.codeowners)],
      ["Agent guidance", mark(report.files.codexGuidance)]
    ]),
    "",
    "## Maintenance Signals",
    "",
    table([
      ["Git repository", mark(report.git.available)],
      [`Commits in last ${report.sinceDays} days`, countValue(report.git.recentCommitCount, report.git.recentCommitCountCapped)],
      ["Latest commit", report.git.latestCommit ? `${report.git.latestCommit.date} ${report.git.latestCommit.subject}` : "n/a"],
      ["Release tags", countValue(report.git.tagCount, report.git.tagCountCapped)],
      ["GitHub Actions workflows", value(report.automation.githubActions.length)],
      ["Test script", report.automation.testScript ?? "n/a"],
      ["Check script", report.automation.checkScript ?? "n/a"]
    ]),
    ...renderGitHubSignals(report),
    "",
    "## Application Evidence Draft",
    "",
    "- Maintainer role: describe your role and the parts of the project you actively maintain.",
    "- User impact: describe who depends on this project and what would break or slow down without it.",
    "- Maintenance plan: list the next three tasks where Codex or ChatGPT can accelerate real OSS work.",
    "- Adoption evidence: add links to releases, dependent projects, downloads, stars, issues, or community usage.",
    "- Responsible use: explain that credits will be used for project maintenance, tests, documentation, and review workflows.",
    "",
    "## Recommended Next Steps",
    "",
    ...renderRecommendations(report.recommendations)
  ];

  return `${lines.join("\n")}\n`;
}

function renderGitHubSignals(report) {
  if (!report.github) {
    return [];
  }

  return [
    "",
    "## Public GitHub Signals",
    "",
    table([
      ["Repository", report.github.fullName],
      ["Default branch", report.github.defaultBranch],
      ["Stars", value(report.github.stars)],
      ["Forks", value(report.github.forks)],
      ["Open issues", value(report.github.openIssues)],
      ["License", report.github.license ?? "n/a"],
      ["Latest release", report.github.latestRelease ? `${report.github.latestRelease.tagName} (${report.github.latestRelease.publishedAt?.slice(0, 10) ?? "unknown"})` : "n/a"],
      ["Topics", report.github.topics.length > 0 ? report.github.topics.join(", ") : "n/a"]
    ])
  ];
}

export function renderJson(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function table(rows) {
  const body = rows.map(([label, value]) => `| ${label} | ${value} |`);
  return ["| Signal | Value |", "| --- | --- |", ...body].join("\n");
}

function mark(value) {
  return value ? "yes" : "no";
}

function value(input) {
  return input === null || input === undefined ? "n/a" : String(input);
}

function countValue(input, capped = false) {
  const rendered = value(input);
  return capped ? `${rendered}+` : rendered;
}

function renderRecommendations(recommendations) {
  if (recommendations.length === 0) {
    return ["- No obvious repository hygiene gaps found. Focus on documenting adoption and maintenance impact."];
  }

  return recommendations.map((recommendation) => `- ${recommendation}`);
}
