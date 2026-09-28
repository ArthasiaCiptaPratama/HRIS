# Mission Creator Agent — Schema Documentation

## Input: AnalysisDocument

The Mission Creator receives a complete `AnalysisDocument` as input (see Analyzer schema documentation).

## Output: MissionPlan

### Top-Level Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `metadata` | MissionMetadata | Yes | Mission identification and summary |
| `tasks` | SubTask[] | Yes | Ordered list of executable sub-tasks |
| `globalSuccessCriteria` | string[] | Yes | Overall mission completion criteria |
| `fileManifest` | FileOperation[] | Yes | All files that will be touched |
| `skillManifest` | SkillManifestEntry[] | No | Maps skills to tasks |
| `executionPlan` | enum | Yes | `sequential` \| `parallel` \| `hybrid` |
| `status` | enum | Yes | `draft` \| `approved` \| `in_progress` \| `completed` \| `failed` \| `cancelled` |
| `creatorVersion` | string | Yes | Version of the mission creator prompt used |

### MissionMetadata Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `missionId` | UUID | Yes | Unique mission identifier |
| `sessionId` | UUID | Yes | Associated session ID |
| `analysisId` | UUID | Yes | Associated analysis ID |
| `title` | string | Yes | Mission title (max 80 chars) |
| `summary` | string | Yes | 1-2 sentence description |
| `overallPriority` | enum | Yes | `critical` \| `high` \| `medium` \| `low` |
| `estimatedTasks` | integer | Yes | Total number of sub-tasks |
| `createdAt` | ISO 8601 | Yes | When the mission was created |
| `expiresAt` | ISO 8601 | No | When the mission expires |

### SubTask Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `taskId` | string | Yes | Unique task ID (e.g., `task-1`) |
| `title` | string | Yes | Short task title |
| `description` | string | Yes | Detailed description of work to do |
| `requiredSkills` | string[] | Yes | Skill IDs needed for this task |
| `fileOperations` | FileOperation[] | No | Files to create/modify/delete |
| `successCriteria` | string[] | Yes | Criteria to validate task completion |
| `estimatedComplexity` | enum | Yes | `trivial` \| `simple` \| `moderate` \| `complex` \| `epic` |
| `dependsOn` | string[] | No | Task IDs this task depends on |
| `status` | enum | Yes | `pending` \| `in_progress` \| `completed` \| `failed` \| `skipped` |
| `notes` | string | No | Additional notes or context |

### FileOperation Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `filePath` | string | Yes | Relative path from project root |
| `operation` | enum | Yes | `create` \| `modify` \| `delete` \| `read` |
| `purpose` | string | Yes | Why this file is needed |
| `contentGuidance` | string | No | Hints for file content |
| `dependencies` | string[] | No | Other file paths this depends on |

### SkillManifestEntry Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `skillId` | string | Yes | Skill identifier |
| `taskIds` | string[] | Yes | Tasks that use this skill |

### Example Output

```json
{
  "metadata": {
    "missionId": "m1n2o3p4-q5r6-7890-stuv-wxyz12345678",
    "sessionId": "f1e2d3c4-b5a6-9870-dcba-fedcba098765",
    "analysisId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "title": "Leave Request Management System",
    "summary": "Build a complete leave management system with employee submission and manager approval workflows",
    "overallPriority": "high",
    "estimatedTasks": 5,
    "createdAt": "2026-09-25T10:31:00.000Z"
  },
  "tasks": [
    {
      "taskId": "task-1",
      "title": "Design Leave Request Database Schema",
      "description": "Create database models for LeaveRequest entity including status enum, date ranges, and employee relationship",
      "requiredSkills": ["database-schema", "hr-leave-management"],
      "fileOperations": [
        {
          "filePath": "src/models/LeaveRequest.ts",
          "operation": "create",
          "purpose": "Define LeaveRequest model with TypeScript types",
          "contentGuidance": "Use Zod for runtime validation"
        }
      ],
      "successCriteria": [
        "LeaveRequest model exists with all required fields",
        "Status enum includes: pending, approved, rejected, cancelled",
        "Model validates date range (endDate >= startDate)"
      ],
      "estimatedComplexity": "simple",
      "dependsOn": [],
      "status": "pending"
    },
    {
      "taskId": "task-2",
      "title": "Create Leave Request API Endpoints",
      "description": "Build REST API endpoints for CRUD operations on leave requests",
      "requiredSkills": ["api-endpoint", "typescript-backend"],
      "fileOperations": [
        {
          "filePath": "src/routes/leave.ts",
          "operation": "create",
          "purpose": "API routes for leave request CRUD"
        }
      ],
      "successCriteria": [
        "POST /api/v1/leave-requests creates a request",
        "GET /api/v1/leave-requests returns user's requests",
        "PATCH /api/v1/leave-requests/:id allows status updates"
      ],
      "estimatedComplexity": "moderate",
      "dependsOn": ["task-1"],
      "status": "pending"
    }
  ],
  "globalSuccessCriteria": [
    "Employee can submit a leave request",
    "Manager can view and approve/reject requests",
    "Leave balance is deducted upon approval",
    "All API endpoints have unit tests"
  ],
  "fileManifest": [
    { "filePath": "src/models/LeaveRequest.ts", "operation": "create", "purpose": "Data model" },
    { "filePath": "src/routes/leave.ts", "operation": "create", "purpose": "API routes" }
  ],
  "skillManifest": [
    { "skillId": "database-schema", "taskIds": ["task-1"] },
    { "skillId": "api-endpoint", "taskIds": ["task-2"] }
  ],
  "executionPlan": "sequential",
  "status": "draft",
  "creatorVersion": "1.0.0"
}
```

## Task Dependency Rules

1. Schema tasks must come before API tasks
2. API tasks must come before UI tasks
3. Auth tasks should come before protected endpoints
4. Testing tasks should always be last
5. No circular dependencies allowed
