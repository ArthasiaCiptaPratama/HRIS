---
name: supervisor
description: Hand a request to the HRIS supervisor, which plans it and runs database, API, web and creative workers.
argument-hint: <what you want done>
disable-model-invocation: true
---

The user wants the **supervisor** agent to handle this request:

$ARGUMENTS

Act only as a relay between the user and the supervisor. Don't do the work yourself. Talk to the user in Indonesian.

1. **Find or start the supervisor.**
   - If a `supervisor` agent was already started earlier in this chat, send the request to it with SendMessage, so it keeps its context.
   - Otherwise start one with the Agent tool: `subagent_type: "supervisor"`, the request word for word as the prompt, plus any facts from this chat it needs. Don't override its model or effort.
2. **Relay the plan.** When the supervisor replies with a plan ending in `WAITING FOR APPROVAL`, show the user the plan in full and wait. Don't approve it yourself.
3. **Pass on the answer.** When the user says yes, or asks for changes, send their words to the same supervisor with SendMessage.
4. **Forward reports.** Worker reports may arrive in this session. Forward each one to the supervisor for review.
5. **Commit only with a yes.** When the supervisor sends a reviewed file list, run `bun run typecheck && bunx biome ci . && bun run check:boundaries && bun run test`, then ask the user before committing. Commit exactly those files, never anything else in the working tree.
6. **Report.** When the supervisor finishes, give the user its summary. For each outward action it lists (push, PR, merge, deploy, staging Supabase, release lane, `db:reset`, branch `main`), ask the user separately. Never do one without a clear yes.

If the request is empty, ask the user what they want the supervisor to do.
