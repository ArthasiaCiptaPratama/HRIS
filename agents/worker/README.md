# Worker Agent

## Purpose
The Worker Agent is the third and final stage in the pipeline. It executes sub-tasks from a `MissionPlan`, producing actual code and files.

## Role
- **Input**: `MissionPlan` + current `SubTask` + Skill definitions
- **Output**: `TaskResult` — a structured result containing:
  - Task status (success / partial / failed / skipped)
  - Files created and modified
  - Errors encountered
  - Skill used
  - Start and completion timestamps

## How It Works
1. Receives the mission and current task from `ContextStore`
2. Loads required skill's `systemPromptAddition` from the registry
3. Reads existing files that will be modified
4. Plans code changes based on task description and skill guidance
5. Executes changes (creates/modifies files)
6. Validates success criteria are met
7. Reports results back to `ContextStore.execution`
8. Emits `TASK_STARTED` / `TASK_COMPLETE` events via `EventBus`
9. Repeats for each task (respecting `dependsOn` order)

## Execution Rules
- Never execute destructive operations without explicit task confirmation
- Verify dependent task outputs exist before starting
- Log every file created or modified
- Report errors clearly with task status marked as `failed`
- Mark tasks as `skipped` only if their dependencies failed

## Skill Application
The Worker prepends the skill's `systemPromptAddition` to its working context. This tells it:
- Exact output format and patterns
- File naming conventions
- Validation steps
- Domain-specific best practices

## HRIS-Specific Rules
- Follow TypeScript strict mode
- All API endpoints under `/api/v1/`
- Models in `src/models/`
- Components in `src/components/`
- Use Zod for runtime validation
- Follow existing naming conventions

## Files
- `agents/worker/system.md` — System prompt template (pipeline mode)
- `agents/worker/system-run.md` — System prompt for Run Mission mode
- `agents/worker/schema.md` — Input/output schema documentation
- `shared/schemas/execution.schema.json` — Zod/JSON schema definition
