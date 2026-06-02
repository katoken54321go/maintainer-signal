# Contributing

Thanks for helping improve `maintainer-signal`.

## Local Setup

```bash
npm test
node bin/maintainer-signal.js --repo .
```

The project currently has no runtime dependencies. Node.js 20 or newer is recommended.

## Contribution Scope

Good first contributions include:

- New repository hygiene checks.
- Better Markdown report wording.
- JSON schema documentation.
- Tests for edge cases.
- Public data collectors that do not require private credentials.

## Pull Request Checklist

- Run `npm run check`.
- Run `npm test`.
- Keep new network-backed behavior optional.
- Avoid collecting secrets or private repository data by default.
