<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Matt Pocock skills

Use the installed skills in `.agents/skills/` as the project workflows. Before
starting work, match the request to a skill by its description and follow that
skill when it applies; read its `SKILL.md` and any references it points to.
For an unclear workflow, use the installed skill index in
`.agents/skills/ask-matt/SKILL.md` as a guide, then inspect the chosen skill.

Skills marked `disable-model-invocation: true` are intentionally user-invoked:
do not start those workflows unless the user names them or clearly requests the
workflow they provide. Skills without that flag may be selected automatically
when their descriptions fit the task. In particular, use `tdd` for test-first
work, `diagnosing-bugs` for hard-to-reproduce failures, `domain-modeling` when
resolving domain terms or ADRs, and `code-review` when asked to review changes.

For feature work, follow the skills' idea-to-ship flow when appropriate:
`grill-with-docs` → `to-spec` → `to-tickets` → `implement` (or
`implement-spec` for a multi-ticket build). Use `triage` for incoming issues,
not tickets already produced by `to-tickets`. Read `docs/agents/` for this
repo's issue tracker, triage labels, and domain-doc conventions. These files
are the repo-specific configuration; do not duplicate their contents here.

## Validation

Run checks that cover the files and behavior changed. For a focused change,
prefer the narrowest relevant check; run the full suite and production build
when the change spans shared behavior or could affect the app as a whole. Skip
unrelated checks, and report which checks were run or left out.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues on `timblazing/sportscal` via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
