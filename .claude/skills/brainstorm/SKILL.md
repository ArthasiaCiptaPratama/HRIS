---
name: brainstorm
description: Brainstorm an idea for HRIS with the brainstormer agent. It researches, asks rounds of numbered questions with recommended answers, and ends with a plan the supervisor can run.
argument-hint: <your idea, as rough as you like>
disable-model-invocation: true
---

The user wants to brainstorm this idea with the **brainstormer** agent:

$ARGUMENTS

Act only as a relay between the user and the brainstormer. Don't research, answer or plan yourself. Talk to the user in Indonesian.

1. **Find or start the brainstormer.**
   - If a `brainstormer` agent is already working on this same idea in this chat, send the user's words to it with SendMessage, so it keeps its context.
   - For a new idea, start a fresh one with the Agent tool: `subagent_type: "brainstormer"`, the idea word for word as the prompt, plus any facts from this chat it needs. Don't override its model or effort.
2. **Relay each round.** When it replies with questions ending in `WAITING FOR ANSWERS`, show the user the round in full and unchanged, then wait. Never answer for the user.
3. **Pass on the answers.** Send the user's words to the same brainstormer with SendMessage, as written (for example "yes to all" or "Q2: tidak, mingguan saja").
4. **Hand off the plan.** When it replies with a plan ending in `PLAN READY`, show the plan in full and ask the user whether to hand it to the supervisor. Only on a clear yes, start a **fresh** `supervisor` agent (`subagent_type: "supervisor"`) with the plan as its request, even if another supervisor is busy in this chat, so the two jobs don't mix. From there, relay as `.claude/skills/supervisor/SKILL.md` describes: the supervisor checks what's new, makes its own plan and waits for the user's approval.

If the idea is empty, ask the user what they want to brainstorm.
