---
name: fitur-kecil
description: Plan and run a small HRIS feature change from a compact feature card (kartu fitur) instead of re-reading README, codemap and code. One plan approval, then one quick-worker does the work. Anything bigger goes to /supervisor.
argument-hint: <the small change you want>
disable-model-invocation: true
---

The user wants this small change:

$ARGUMENTS

You run this path yourself, in the main session: check, plan, wait for approval, hand the work to one `quick-worker`, review, verify, then ask before committing. Talk to the user in Indonesian.

The repo's own rules come first: `CLAUDE.md`, `docs/PROMPT.md` §3 Aturan Emas and the `hris-workflow` skill. Plans always wait for approval, every outward action is asked separately, and you never decide an open decision (OD). This path does not run the github, supabase or vercel checkers: the "Yang baru" status report is only available through `/supervisor`.

If the request is empty, ask the user what they want changed.

## 1. Cheap state check

Run `git status -sb`, `git log -1 --oneline` and `git rev-parse --show-toplevel`. Nothing more.

- Stop and tell the user if the branch is `main`, `HRIS/Oatse/rilis` or `HRIS/debug/*`, or the folder is `HRIS-rilis` (release lane, D-043).
- Note any uncommitted changes. They are not yours: never stage them, and ask the user if they overlap the files you plan to touch.
- Note the branch type for the docs rule: develop (`HRIS/Oatse/Linux-Windows`) or a teammate branch (`HRIS/<nama>/...`).

## 2. Find the card

Cards live in `.claude/skills/fitur-kecil/kartu/`. They are an agent cache, not official docs: the feature README, `docs/codemap/` and the code stay the source of truth. If a card disagrees with the code, the code wins and the card gets fixed in the same task.

1. Read `.claude/skills/fitur-kecil/kartu/INDEX.md` and pick the 1–2 cards whose keywords match the request.
2. For each card, take the sha from its `diverifikasi:` line and the paths from its "Jalur yang dipantau" line:
   - `git cat-file -e <sha>^{commit}`: if it fails, the sha is unknown on this branch and the card is stale.
   - `git diff --stat <sha> -- <card paths>` (no `..HEAD`, so uncommitted edits count too).
3. Re-read only the files that changed since the sha and the files you plan to edit. Read the README, codemap or other code only when the card points you there or something doesn't add up.
4. The card is stale when the sha is unknown, more than 10 listed files changed, or a listed file or symbol no longer exists. No card or a stale card: the plan's first point is a `quick-worker` in `MODE: KARTU` that builds or refreshes it from code, following `.claude/skills/fitur-kecil/KARTU-TEMPLATE.md`. Cards for features not yet in the index are created this way on first use, as part of that task's approved plan.

## 3. Is it small? (gate)

The change is small only if every line below holds. If any fails, stop, tell the user which one and why, and recommend `/supervisor <request>`.

- No Prisma schema or migration change.
- No new module.
- No access-model change: no new role, no new grant, no change to who may do what.
- No money amounts (salary, overtime rupiah, payouts) and no new sensitive data (NIK, NPWP, KK, bank account, address, salary, selfie, documents).
- Nothing on the release lane (`HRIS-rilis`, `HRIS/debug/*`, the `FEATURES` switches in `apps/web/src/app/feature-flags.ts`) and nothing on branch `main`.
- About 8 code and test files at most, counted under `apps/**` and `packages/**`. The card, the feature `README.md` and `log.md` don't count.
- A new endpoint is allowed only if it reuses an existing policy pattern in `<modul>.policy.ts` and gets tests for success (200), 400, 401 and 403.

## 4. Plan and wait

Write a compact plan in the `hris-workflow` "Rencana" template (`.claude/skills/hris-workflow/TEMPLATES.md`), in Indonesian:

- feature, the checklist item in the feature README, and any related OD. If the change depends on an open OD, stop: give the options and your recommendation, never decide it.
- work points with the exact files from the card, each with its check (including the card's test files)
- docs to update: feature README checklist, `log.md`, the card, and codemap per the branch rule in the facts block
- whether the worker gets a readiness check (step 5)
- outward actions that will be proposed (commit, push), risks, and what is out of scope

End with "Lanjut dengan rencana ini?" and wait. Change no file until the user says yes.

## 5. Hand off to quick-worker

After the yes, start one `quick-worker` with the Agent tool (`subagent_type: "quick-worker"`; don't override its model or effort). It knows nothing of this chat, so give it a complete brief:

- the goal in one line and the approved plan points
- the card excerpt (the sections this change needs), the card's sha and the `git diff --stat` result; tell it to re-read only what changed since that sha plus the files it edits
- the exact files it owns, including the card, its `INDEX.md` row and the docs; and what it must not touch (`CLAUDE.md`, any `settings*.json`, other cards, any file not named)
- the checks to run, including the card's test files
- the docs to update, including the card
- the facts block below
- the mode:
  - `MODE: GO` only if the plan touches at most 2 files and has no access, money or sensitive-data change
  - otherwise `MODE: READINESS CHECK`. Answer its questions from the card and the plan; bring real decisions to the user. Then message the **same** worker `GO` plus the answers (SendMessage).
  - `MODE: KARTU` for building or refreshing a card. Run it first, as its own worker; the change worker then gets the fresh card.

Workers never commit, push or deploy.

## 6. Review

Check the report against the plan, the Aturan Emas and the verification table in `hris-workflow`:

- only the planned files changed (`git status -sb`, `git diff --stat`)
- every check ran, with real results; anything unchecked is marked "belum diverifikasi"
- the card was updated, with `diverifikasi:` set to the sha the worker started from plus the date

If something is wrong, message the same worker (SendMessage) to fix its own work. A new task always gets a new worker.

## 7. Verify

Before asking to commit, run from the repo root:

```sh
bun run typecheck && bunx biome ci . && bun run check:boundaries
<local prefix> bun run db:which
<local prefix> bun run test
```

`<local prefix>` is the override from the facts block. Read the `db:which` output: it must say local, host `127.0.0.1`/`localhost:5432`, database `hris`. It exits 0 either way, so `&&` alone does not guard. The test preload (`apps/api/tests/helpers/db-guard-preload.ts`) aborts on a remote URL as a backstop.

## 8. Report, then commit only with a yes

Report with the `hris-workflow` "Laporan akhir" template, in Indonesian: what changed (files), verification with real commands and results (`✔ ✘ ⚠ —`), findings outside the scope, and under "Butuh dari Anda" each outward action separately (the commit, then the push).

Commit only after a clear yes, and push only after a separate yes. Commit exactly the reviewed files with `git add <file> ...`, never `git add -A` or `git add .`, and never `CLAUDE.md`. Use the repo's style: Conventional Commits without scope, Indonesian, lowercase (PROMPT §8).

## Facts every brief needs

- Use `bun`, never npm/node. Before reporting: `bun run typecheck && bunx biome ci . && bun run check:boundaries` and the relevant tests.
- `.env` may be in Supabase mode. Never flip it (no `db:use`), and never set `HRIS_ALLOW_REMOTE_DB`. For anything that touches the DB, put the local override in front of the command: `DATABASE_URL=<value of LOCAL_DATABASE_URL> DIRECT_URL=<value of LOCAL_DIRECT_URL> STORAGE_PATH_PREFIX=<value of LOCAL_STORAGE_PATH_PREFIX>`. Read only those three `LOCAL_*` lines from `.env`, and never copy any `.env` value into a file.
- Immediately before every DB run, run `bun run db:which` with the same prefix and chain with `&&`, never `;`. Plain `db:which` may say Supabase; stop only if the overridden one isn't local `hris` on `127.0.0.1`/`localhost:5432`.
- API tests: `NODE_ENV=test bun --env-file=../../.env test` in `apps/api` (or `<local prefix> bun run --cwd apps/api test <file>` from the root). Web tests: `bun run test:web` (or `bun run --cwd apps/web test <file>`). Migrations are outside this path.
- Local DB: Postgres on `127.0.0.1:5432`, database `hris`. Ports 553xx belong to another project: never touch them.
- Web dev server on 5173 (strict), API on 3000. If they're already running, use them; never stop a process you didn't start.
- Sensitive data (NIK, NPWP, KK, bank account, address, salary, selfie, documents) never goes into logs, errors, test output or reports. Salary amounts are SUPER_ADMIN only.
- Every endpoint has an explicit, deny-by-default check in `<modul>.policy.ts`. Modules import each other only through `modules/<modul>/index.ts`.
- Test data is tagged (e.g. emails containing `__test`); only your own tagged rows may be deleted. Real employee data never enters the repo (D-042). Never write secrets into files.
- Docs in Indonesian are updated in the same task: the feature README checklist and one `log.md` entry. On develop, also `docs/codemap/<modul>.md`. On a teammate branch, `docs/codemap/`, `PROGRESS.md` and `RELEASE.md` are not edited: put a "catatan codemap" in `log.md` instead (PROMPT §8 "Aturan untuk rekan tim").

## Keeping cards fresh

- The worker updates the card in the same task: changed files and symbols, new endpoints, new recipes or gotchas, and `diverifikasi: <HEAD sha it started from> <YYYY-MM-DD>`, plus the same value in the card's `INDEX.md` row.
- A card stays at about 150 lines or fewer and never holds secrets, real employee data or sensitive values.
- A card is a cache: if it disagrees with the code, the code wins and the card gets fixed.
