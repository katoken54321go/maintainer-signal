# Usage Evidence

This project should document real use instead of inflated adoption claims.

## 2026-06-03: Self-Report

Target: `github.com/katoken54321go/maintainer-signal`

Command:

```bash
node bin/maintainer-signal.js --repo . --repo-label github.com/katoken54321go/maintainer-signal --strict --fail-under 100 --out examples/self-report.md
```

Result:

- Generated `examples/self-report.md`.
- Signal score: 13/13 (100%).
- The strict health gate passed.

## 2026-06-03: External Public Repository Reports

These reports use only public GitHub REST API data and do not imply endorsement from the repository maintainers.

Targets:

- `openai/openai-cookbook`
- `nodejs/node`

Commands:

```bash
node bin/maintainer-signal.js --github-repo openai/openai-cookbook --out examples/external/openai-cookbook-report.md
node bin/maintainer-signal.js --github-repo nodejs/node --out examples/external/nodejs-node-report.md
```

Results:

- Added `examples/external/openai-cookbook-report.md`.
- Added `examples/external/nodejs-node-report.md`.
- Confirmed the public GitHub signal collector can capture repository metadata, recent commits, tags, releases, workflows, topics, and basic hygiene files.

## Next Evidence To Gather

- Feedback from maintainers who tried the tool.
- Public issues or pull requests created from report recommendations.
- Release notes showing improvements driven by real reports.
