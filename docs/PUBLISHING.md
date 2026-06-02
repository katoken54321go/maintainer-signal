# Publishing

## Create A Public GitHub Repository

```bash
git init
git add .
git commit -m "Initial maintainer-signal release"
git branch -M main
git remote add origin git@github.com:katoken54321go/maintainer-signal.git
git push -u origin main
```

## First Release Checklist

- Replace `YOUR-USER` in the README.
- Confirm the license and maintainer contact path.
- Run `npm run check`.
- Run `npm test`.
- Generate `maintainer-signal-report.md`.
- Create a `v0.1.0` Git tag.
- Publish a GitHub release with the generated report as an example.

## After Publishing

- Add screenshots or report excerpts to the README.
- Open roadmap issues.
- Invite feedback from maintainers of small public projects.
- Keep a public changelog.
