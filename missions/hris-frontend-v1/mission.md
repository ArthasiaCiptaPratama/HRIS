# Mission: HRIS Frontend with Dashboard & Personal Management

## Overview

**Mission ID**: `hris-frontend-v1`
**Title**: HRIS Frontend — Dashboard & Personal Management
**Priority**: High
**Status**: Planned

---

## Analysis Summary

### User Request
Create a full-stack HRIS system frontend with:
1. **Dashboard** with chart shortcuts to functions
2. **Leave Quota (Jatah Cuti)** display
3. **Attendance Permission (Izin Hadir)** feature
4. **Business Trip (Perjalanan Dinas)** feature
5. **Top Navigation** with Dashboard and Personal Management links
6. **Personal Management** page showing employee personal data
7. **Sidebar** in Personal Management with available functions
8. **Fully responsive** design
9. **Bun runtime** for backend
10. **Prisma + PostgreSQL** for database

### Primary Domain
`self_service_portal` + `employee_management`

### Identified Skills
- `react-component` (or vanilla JS components)
- `typescript-backend`
- `database-schema`
- `api-endpoint`

---

## Sub-Tasks

### Task 1: Initialize Bun Project
**Complexity**: Simple
**Required Skills**: `typescript-backend`
**Files to Create**:
- `package.json`
- `tsconfig.json`
- `.env.example`
- `src/index.ts` (entry point)
- `src/app.ts` (app factory)

**Success Criteria**:
- Bun project initializes with TypeScript
- `bun run dev` starts the server
- Project structure matches spec

---

### Task 2: Set Up Prisma with PostgreSQL
**Complexity**: Moderate
**Required Skills**: `database-schema`
**Files to Create/Modify**:
- `prisma/schema.prisma` (new)
- `.env` (update with DATABASE_URL)

**Schema Entities**:
1. **Employee** — id, name, email, phone, address, department, position, joinDate, photo, createdAt, updatedAt
2. **LeaveQuota** — id, employeeId, leaveType (annual/sick/personal), totalDays, usedDays, year
3. **AttendancePermission** (Izin Hadir) — id, employeeId, type (sick/permit/business), date, reason, status (pending/approved/rejected), createdAt
4. **BusinessTrip** (Perjalanan Dinas) — id, employeeId, destination, purpose, startDate, endDate, status, createdAt

**Success Criteria**:
- `bunx prisma generate` runs successfully
- `bunx prisma migrate dev` creates tables
- Database connection works

---

### Task 3: Build Bun Backend API
**Complexity**: Moderate
**Required Skills**: `api-endpoint`, `typescript-backend`
**Files to Create**:
- `src/routes/employee.ts`
- `src/routes/leave.ts`
- `src/routes/attendance.ts`
- `src/routes/businessTrip.ts`
- `src/controllers/*.ts`
- `src/services/*.ts`

**API Endpoints**:
```
GET    /api/employees          — List all employees
GET    /api/employees/:id      — Get employee by ID
POST   /api/employees          — Create employee
PUT    /api/employees/:id      — Update employee
DELETE /api/employees/:id      — Delete employee

GET    /api/leave-quotas/:employeeId       — Get leave quotas
POST   /api/leave-quotas                    — Create leave quota
PUT    /api/leave-quotas/:id               — Update leave quota

GET    /api/attendance-permissions          — List permissions
GET    /api/attendance-permissions/:id      — Get permission
POST   /api/attendance-permissions          — Create permission
PUT    /api/attendance-permissions/:id      — Update permission (approve/reject)

GET    /api/business-trips                  — List trips
GET    /api/business-trips/:id              — Get trip
POST   /api/business-trips                  — Create trip
PUT    /api/business-trips/:id               — Update trip
```

**Success Criteria**:
- All endpoints return proper JSON
- CORS enabled for frontend
- Error handling returns proper status codes

---

### Task 4: Build Responsive HRIS Frontend
**Complexity**: Complex
**Required Skills**: `react-component` (implemented as vanilla JS)
**Files to Create**:
- `public/index.html`
- `public/css/style.css`
- `public/js/app.js`
- `public/js/api.js`
- `public/js/dashboard.js`
- `public/js/personal.js`

**Frontend Structure**:

```
Top Navigation Bar
├── Logo/Brand
├── Dashboard (link)
└── Personal Management (link)

Dashboard Page
├── Chart Shortcuts (3 cards with icons)
│   ├── Jatah Cuti (Leave Quota) — links to leave management
│   ├── Izin Hadir (Attendance Permission) — links to attendance
│   └── Perjalanan Dinas (Business Trip) — links to business trip
├── Quick Stats (total employees, pending requests, etc.)
└── Recent Activity Chart (using Chart.js)

Personal Management Page
├── Sidebar (left)
│   ├── My Profile
│   ├── Leave Quota
│   ├── Attendance Permission
│   ├── Business Trip
│   └── Settings
└── Main Content Area
    ├── My Profile → Shows personal employee data
    ├── Leave Quota → Shows jatah cuti with chart
    ├── Attendance Permission → Form to request izin hadir
    └── Business Trip → Form to request perjalanan dinas
```

**Responsive Breakpoints**:
- Desktop: Full sidebar + content
- Tablet: Collapsible sidebar
- Mobile: Bottom navigation or hamburger menu

**Success Criteria**:
- All pages are responsive
- Charts render with Chart.js
- Forms submit to API
- Data displays correctly from API
- Navigation works between pages

---

## Global Success Criteria

1. User can view dashboard with chart shortcuts
2. User can see leave quota (jatah cuti) with visual chart
3. User can submit attendance permission (izin hadir) request
4. User can submit business trip (perjalanan dinas) request
5. User can view and edit personal data in Personal Management
6. Sidebar navigation works correctly
7. All pages are responsive on mobile, tablet, desktop
8. Backend API serves data correctly
9. Prisma connects to PostgreSQL successfully

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Bun |
| Language | TypeScript |
| Database | PostgreSQL |
| ORM | Prisma |
| Frontend | HTML5 + CSS3 + Vanilla JS |
| Charts | Chart.js |
| Icons | Lucide Icons (via CDN) |

---

## File Manifest

```
HRIS/
├── package.json
├── tsconfig.json
├── .env.example
├── .env
├── src/
│   ├── index.ts
│   ├── app.ts
│   ├── routes/
│   │   ├── employee.ts
│   │   ├── leave.ts
│   │   ├── attendance.ts
│   │   └── businessTrip.ts
│   ├── controllers/
│   │   ├── employeeController.ts
│   │   ├── leaveController.ts
│   │   ├── attendanceController.ts
│   │   └── businessTripController.ts
│   ├── services/
│   │   ├── employeeService.ts
│   │   ├── leaveService.ts
│   │   ├── attendanceService.ts
│   │   └── businessTripService.ts
│   └── types/
│       └── index.ts
├── prisma/
│   └── schema.prisma
└── public/
    ├── index.html
    ├── css/
    │   └── style.css
    └── js/
        ├── app.js
        ├── api.js
        ├── dashboard.js
        └── personal.js
```
