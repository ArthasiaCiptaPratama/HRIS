# Analyzer Agent — Schema Documentation

## Input

**Source**: User input stream
**Format**: String prefixed with `"Claude Mission:"`

Example:
```
Claude Mission: Create a leave request system where employees can request time off and managers can approve or reject them
```

## Output: AnalysisDocument

### Top-Level Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `analysisId` | UUID | Yes | Unique identifier for this analysis |
| `sessionId` | UUID | Yes | Session this analysis belongs to |
| `userInput` | string | Yes | Raw user input text |
| `interpretedIntent` | string | Yes | Plain-language interpretation of what the user wants |
| `primaryDomain` | enum | Yes | Main HRIS domain (see domains below) |
| `secondaryDomains` | enum[] | No | Additional relevant domains |
| `entities` | Entity[] | No | Identified entities with attributes |
| `requirements` | Requirement[] | Yes | Discrete, testable items with priorities |
| `constraints` | string[] | No | Technical or business constraints |
| `identifiedSkills` | IdentifiedSkill[] | No | Skills matched from the registry |
| `ambiguities` | Ambiguity[] | No | Questions to clarify uncertain points |
| `confidence` | number | Yes | 0.0–1.0 confidence in the interpretation |
| `analyzerVersion` | string | Yes | Version of the analyzer prompt used |
| `analyzedAt` | ISO 8601 | Yes | Timestamp of analysis |

### Entity Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Entity name (e.g., "Employee", "LeaveRequest") |
| `type` | enum | Yes | One of: `employee`, `department`, `role`, `leave`, `payroll`, `attendance`, `document`, `report`, `user`, `system` |
| `description` | string | No | Human-readable description |
| `attributes` | Attribute[] | No | List of entity fields |

### EntityAttribute Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Attribute name |
| `dataType` | string | Yes | Type (e.g., `string`, `number`, `date`, `boolean`) |
| `required` | boolean | No | Whether the field is mandatory |
| `description` | string | No | Purpose of the attribute |

### Requirement Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique requirement ID (e.g., `REQ-001`) |
| `description` | string | Yes | What must be achieved |
| `priority` | enum | Yes | `critical`, `high`, `medium`, `low` |
| `category` | string | No | Logical grouping |
| `acceptanceCriteria` | string[] | No | Testable conditions for completion |

### IdentifiedSkill Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `skillId` | string | Yes | Skill identifier from the registry |
| `confidence` | number | Yes | 0.0–1.0 match confidence |
| `reasoning` | string | No | Why this skill was matched |

### Ambiguity Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `question` | string | Yes | Clarifying question |
| `options` | string[] | Yes | Available options to choose from |

### HRIS Domain Enum

```json
[
  "employee_management",
  "attendance_tracking",
  "leave_management",
  "payroll_processing",
  "recruitment_onboarding",
  "performance_management",
  "benefits_administration",
  "training_development",
  "org_structure",
  "compliance_reporting",
  "self_service_portal",
  "system_configuration",
  "integration"
]
```

### Example Output

```json
{
  "analysisId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "sessionId": "f1e2d3c4-b5a6-9870-dcba-fedcba098765",
  "userInput": "Claude Mission: Create a leave request system where employees can request time off and managers can approve or reject them",
  "interpretedIntent": "Build a leave management system with employee submission and manager approval workflows",
  "primaryDomain": "leave_management",
  "secondaryDomains": ["attendance_tracking", "self_service_portal"],
  "entities": [
    {
      "name": "LeaveRequest",
      "type": "leave",
      "description": "An employee's request for time off",
      "attributes": [
        { "name": "employeeId", "dataType": "string", "required": true },
        { "name": "leaveType", "dataType": "string", "required": true },
        { "name": "startDate", "dataType": "date", "required": true },
        { "name": "endDate", "dataType": "date", "required": true },
        { "name": "status", "dataType": "enum", "required": true },
        { "name": "reason", "dataType": "string", "required": false }
      ]
    }
  ],
  "requirements": [
    {
      "id": "REQ-001",
      "description": "Employees can submit leave requests",
      "priority": "high",
      "acceptanceCriteria": [
        "Form captures leave type, dates, and reason",
        "Request is saved to database with pending status"
      ]
    }
  ],
  "identifiedSkills": [
    { "skillId": "hr-leave-management", "confidence": 0.95, "reasoning": "Directly matches leave request requirement" },
    { "skillId": "database-schema", "confidence": 0.8, "reasoning": "New entity requires schema definition" }
  ],
  "confidence": 0.85,
  "analyzerVersion": "1.0.0",
  "analyzedAt": "2026-09-25T10:30:00.000Z"
}
```
