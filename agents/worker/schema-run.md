# Worker Agent — Run Mission Mode

## Purpose
The Worker Agent can run in two modes:

1. **Pipeline mode** — Executed as part of the full pipeline (Analyze → Plan → Execute)
2. **Standalone mode** — Executed directly via `Claude Mission: Run Mission`

## Standalone Trigger

When the user inputs:
```
Claude Mission: Run Mission [mission identifier]
```

The system skips Analysis and Mission Creation phases, and goes straight to execution.

## How Standalone Mode Works

1. **Identify mission** — Parse the identifier and find matching session in `missions/`
2. **Load context** — Read `mission.json`, `analysis.json`, and any existing `execution.json`
3. **Determine resume point** — Find first `pending` or `failed` task
4. **Execute** — Run each task with skills from the registry
5. **Persist** — Update `execution.json` after each task

## Prompt Format

```
Claude Mission: Run Mission <identifier>
```

Where `<identifier>` can be:
- Mission ID (UUID)
- Session ID (UUID)
- Mission title keyword (e.g., "leave-management")
- Natural description ("the employee attendance mission")

## Mission Directory Structure

```
missions/
└── {sessionId}/
    ├── analysis.json      # AnalysisDocument
    ├── mission.json        # MissionPlan
    ├── execution.json      # ExecutionResult (created on run)
    └── events.json         # SystemEvent[] (created on run)
```

## Status Persistence

After each task completes, the execution state is saved to `execution.json`. This means:
- If the run is interrupted, it can be resumed
- Previous task results are preserved
- Only pending/failed tasks are re-executed

## Example Session

```
User: Claude Mission: Run Mission leave-request-system

Agent: Found mission "Leave Request Management System" (session: abc123)

Executing task-1: Design Leave Request Database Schema
  ✓ Created src/models/LeaveRequest.ts
  ✓ All success criteria met
  → Saved to execution.json

Executing task-2: Create Leave Request API Endpoints
  ✓ Created src/routes/leave.ts
  ✓ All success criteria met
  → Saved to execution.json

...

Overall status: success (5/5 tasks completed)
```
