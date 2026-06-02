import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { analyzeRepository } from "./analyzer.js";
import { renderJson, renderMarkdown } from "./report.js";

const helpText = `maintainer-signal

Usage:
  maintainer-signal [--repo <path>] [--repo-label <label>] [--format markdown|json] [--out <file>] [--since-days <days>] [--strict] [--fail-under <percent>]

Options:
  --repo <path>        Repository to analyze. Defaults to the current directory.
  --repo-label <label> Public label to show in Markdown reports instead of the local path.
  --format <format>    Output format: markdown or json. Defaults to markdown.
  --out <file>         Write output to a file instead of stdout.
  --since-days <days>  Count recent commits within this window. Defaults to 90.
  --strict             Exit non-zero when any recommendation remains.
  --fail-under <pct>   Exit non-zero when the score is below this percentage.
  --help               Show this help.
`;

export async function runCli(argv) {
  const options = parseArgs(argv);

  if (options.help) {
    console.log(helpText.trim());
    return;
  }

  const report = await analyzeRepository({
    repoPath: options.repo,
    repoLabel: options.repoLabel,
    sinceDays: options.sinceDays
  });

  const rendered = options.format === "json" ? renderJson(report) : renderMarkdown(report);

  if (options.out) {
    const outPath = resolve(options.out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, rendered, "utf8");
    console.log(`Wrote ${outPath}`);
  } else {
    console.log(rendered);
  }

  const gate = evaluateHealthGate(report, options);
  if (!gate.ok) {
    console.error(gate.message);
    process.exitCode = 1;
  }
}

export function parseArgs(argv) {
  const options = {
    format: "markdown",
    help: false,
    out: null,
    repo: ".",
    repoLabel: null,
    strict: false,
    failUnder: null,
    sinceDays: 90
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--repo") {
      options.repo = readValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--format") {
      options.format = readValue(argv, index, arg);
      if (!["markdown", "json"].includes(options.format)) {
        throw new Error("--format must be either markdown or json");
      }
      index += 1;
      continue;
    }

    if (arg === "--repo-label") {
      options.repoLabel = readValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--out") {
      options.out = readValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--since-days") {
      const rawValue = readValue(argv, index, arg);
      const parsed = Number.parseInt(rawValue, 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        throw new Error("--since-days must be a positive integer");
      }
      options.sinceDays = parsed;
      index += 1;
      continue;
    }

    if (arg === "--strict") {
      options.strict = true;
      continue;
    }

    if (arg === "--fail-under") {
      const rawValue = readValue(argv, index, arg);
      const parsed = Number.parseInt(rawValue, 10);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
        throw new Error("--fail-under must be an integer from 0 to 100");
      }
      options.failUnder = parsed;
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

export function evaluateHealthGate(report, options) {
  if (options.failUnder !== null && report.score.percent < options.failUnder) {
    return {
      ok: false,
      message: `Signal score ${report.score.percent}% is below --fail-under ${options.failUnder}%.`
    };
  }

  if (options.strict && report.recommendations.length > 0) {
    return {
      ok: false,
      message: `Strict mode failed with ${report.recommendations.length} recommendation(s).`
    };
  }

  return { ok: true, message: "" };
}

function readValue(argv, index, name) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}
