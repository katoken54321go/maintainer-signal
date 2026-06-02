# AGENTS.md

## Project Goal

`maintainer-signal` helps open source maintainers produce truthful repository health reports and application evidence drafts.

## Development Commands

- `npm run check`
- `npm test`
- `node bin/maintainer-signal.js --repo .`

## Coding Guidelines

- Keep the CLI dependency-free unless a dependency removes meaningful complexity.
- Prefer deterministic local checks before adding network-backed collectors.
- Do not collect private tokens, secrets, or personal data.
- Keep reports honest: recommendations may identify missing evidence, but must not fabricate adoption or maintainer impact.

## Verification

Before changing behavior, run:

```bash
npm run check
npm test
```
