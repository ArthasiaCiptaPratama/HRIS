# Worker Agent — Schema Documentation

## Input

The Worker receives:
1. **MissionPlan** — Full mission context
2. **SubTask** — The current task to execute
3. **Skill Registry** — Skill definitions for `requiredSkills`

## Output: TaskResult

### TaskResult Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `taskId` | string | Yes | ID of the task that was executed |
| `status` | enum | Yes | `success` \| `partial` \| `failed` \| `skipped` |
| `startedAt` | ISO 8601 | Yes | When task execution began |
| `completedAt` | ISO 8601 | Yes | When task execution ended |
| `output` | string | No | Human-readable summary of what was done |
| `filesCreated` | string[] | No | Paths of newly created files |
| `filesModified` | string[] | No | Paths of modified files |
| `errors` | string[] | No | Error messages if any occurred |
| `skillUsed` | string | No | Primary skill used for this task |

### Status Meanings

| Status | Meaning |
|--------|---------|
| `success` | Task completed fully, all success criteria met |
| `partial` | Task completed with issues, some criteria not met |
| `failed` | Task could not complete due to errors |
| `skipped` | Task was not executed (dependency failed or cancelled) |

### Example Output

```json
{
  "taskId": "task-1",
  "status": "success",
  "startedAt": "2026-09-25T10:32:00.000Z",
  "completedAt": "2026-09-25T10:35:00.000Z",
  "output": "Created LeaveRequest model with all required fields, status enum, and Zod validation. File created at src/models/LeaveRequest.ts",
  "filesCreated": ["src/models/LeaveRequest.ts"],
  "filesModified": [],
  "errors": [],
  "skillUsed": "database-schema"
}
```

## Execution State

### Per-Mission State Fields

| Field | Type | Description |
|-------|------|-------------|
| `missionId` | UUID | Mission being executed |
| `sessionId` | UUID | Session this belongs to |
| `overallStatus` | enum | `success` \| `partial_success` \| `failed` \| `cancelled` |
| `taskResults` | TaskResult[] | Results from all tasks |
| `startedAt` | ISO 8601 | When execution began |
| `completedAt` | ISO 8601 | When execution ended |
| `summary` | string | Overall execution summary |

## Event Types Emitted

| Event | Payload | When |
|-------|---------|------|
| `TASK_STARTED` | `{ taskId, skillId }` | Before starting a task |
| `TASK_COMPLETE` | `{ taskId, status }` | After a task finishes |
| `MISSION_COMPLETE` | `{ missionId, overallStatus }` | After all tasks finish |
| `ERROR` | `{ source, error }` | When an error occurs |

## Skill Application Example

For a task requiring `["database-schema", "hr-leave-management"]`:

1. Load `skills/database-schema.json` → get `systemPromptAddition`
2. Load `skills/hr-leave-management.json` → get `systemPromptAddition`
3. Merge both additions into the Worker system prompt
4. Execute with combined context

The Worker prepends skill guidance before executing:
```
[SKILL: database-schema]
- Use TypeScript strict mode
- All models must have Zod validation schemas
- Follow existing model patterns in src/models/

[SKILL: hr-leave-management]
- Leave types: annual, sick, personal, unpaid
- Status flow: pending → approved/rejected → cancelled
- Include leave balance validation

[WORKER TASK]
...
```
