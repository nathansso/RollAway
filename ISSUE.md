# Issue Resolution Flow

This is the standard flow collaborators (and their agents) should follow when picking up a GitHub issue on this repo.

## 1. Ingest the issue

- Read the full issue body, not just the title.
- Read all comments, especially cross-reference comments linking it to other issues (e.g. "relates to #N") — those callouts exist to prevent duplicate or conflicting work.
- Note the labels: `sprint-*` (batch), type (`bug`/`enhancement`/`question`/`documentation`), `urgency-*`, `page:*` (frontend screen, if applicable), and `status:blocked` (do not start work on a blocked issue until its blocker is resolved).
- Check the [project board](https://github.com/users/nathansso/projects/3) for the issue's `Track` and `Order` — this tells you what should be done first if the issue depends on other in-progress work.

## 2. Plan an implementation

- Read the relevant source before writing a plan — don't guess at file locations or existing contracts.
- Check `CONTRACTS.md` for any pinned request/response shapes the change must respect.
- Keep the plan scoped to the issue. Don't bundle unrelated fixes or refactors into the same branch.

## 3. Branch and push

- Branch off `main`, named `issue-<number>-<short-slug>` (e.g. `issue-12-valid-email-bug`).
- Commit incrementally with clear messages.
- Push the branch to the remote.

## 4. Resolve and comment

- Open a PR from the branch into `main` referencing the issue (`Fixes #N` or `Relates to #N` if it doesn't fully close it).
- Leave a comment on the issue itself summarizing what changed and linking the PR/branch, so the issue thread stays a readable record even for anyone not reading the PR diff.
- Do not close or merge other issues that were cross-referenced as related — only reference them, unless your change actually resolves them too.
