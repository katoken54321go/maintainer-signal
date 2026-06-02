import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { analyzeRepository } from "./analyzer.js";
import { renderJson, renderMarkdown } from "./report.js";

const helpText = `maintainer-signal

Usage:
  maintainer-signal [--repo <path>] [--format markdown|json] [--out <file>] [--since-days <days>]

Options:
  --repo <path>        Repository to analyze. Defaults to the current directory.
  --format <format>    Output format: markdown or json. Defaults to markdown.
  --out <file>         Write output to a file instead of stdout.
  --since-days <days>  Count recent commits within this window. Defaults to 90.
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
    sinceDays: options.sinceDays
  });

  const rendered = options.format === "json" ? renderJson(report) : renderMarkdown(report);

  if (options.out) {
    const outPath = resolve(options.out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, rendered, "utf8");
    console.log(`Wrote ${outPath}`);
    return;
  }

  console.log(rendered);
}

export function parseArgs(argv) {
  const options = {
    format: "markdown",
    help: false,
    out: null,
    repo: ".",
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

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function readValue(argv, index, name) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}
