## Unattended agents

For Claude (GitHub Actions, `@claude`) running unattended on this repo, on anton's single-use runners.

- Skills come from [timblazing/skills](https://github.com/timblazing/skills). The Claude workflow installs them before each run. Use `build` to land changes (it calls the other workflow skills) and `leaving-pr-comments` for anything you post on GitHub.
- Never push to `main`. Work on a branch and open a pull request.
- Verify with `pnpm build`, `pnpm typecheck`, `pnpm test` and `pnpm lint` before you push (install first with `pnpm install --frozen-lockfile`).
- Do not update local session logs or work logs (for example `docs/WORKLOG.md`); put remaining work in the PR description.
- End every issue comment you post with a status marker on its own last line, as an HTML comment (GitHub doesn't show it): `<!-- proj-agent: needs-input -->` when you are waiting on an answer from the owner, `<!-- proj-agent: working -->` for an acknowledgement or progress note, `<!-- proj-agent: done -->` once the work is finished. proj reads it to show the issue's status.
- The shared instructions installed with the skills are written for a local Mac. In an unattended run, skip the local-only rules: browser work through `agent-browser` (and the `ui-check`, `ui-qa`, `ui-evidence` skills), iOS simulators and Android emulators, the Docker/VM rules and T3 Code tools. Say in the PR what still needs checking by hand.

## Code Review Rules

For `@codex review` and any other code review of this repo.

- Focus on correctness, security and regressions: bugs, unhandled edge cases, data loss, leaked secrets, missing auth or validation, and behavior that changed without the PR saying so.
- Skip style nits, formatting and naming preferences unless they hide a bug.
- Point at the exact line, say what breaks and when, and suggest a fix. Say so when nothing needs changing.
