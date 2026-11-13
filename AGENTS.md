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

## Pull requests

This repo is a proj project. proj reads the first two lines of every PR body and, depending on the project's auto-merge mode (Off, Low-stakes only or Always, set in proj), may merge the PR on its own.

- Start every PR body with exactly these two lines, plain text, nothing before them:
  `Agent: <harness> | <orchestrator> | <model>` then `Risk: <low|medium|high>`.
  Harness is Claude Code or Codex, orchestrator is T3 Code, GitHub Actions or Terminal, and model is the public model name. Write `unknown` for any field you don't know. This applies to PR text written by T3 Code's Create PR button too.
- `Risk: low` touches no protected path and is easy to revert. `medium` touches no protected path but isn't trivially revertible (data shape, behavior users rely on, a wide refactor). `high` touches CI or deploy workflows, auth, migrations or secrets, or could lose data or break production. When unsure, pick the higher level: Low-stakes only merges `Risk: low` PRs without the owner, so rate honestly.
- Before handing a PR back, ask proj whether it will merge it (MCP tool `pull_merge_outlook`, when it's available). If it will, say so instead of asking the owner to merge. The `no-automerge` label keeps any PR for the owner.
