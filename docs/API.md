# Smart Edu — API reference

Base URL: `/api`

Every endpoint returns the same envelope:

```json
{ "success": true,  "data": {}, "message": "Operation successful" }
{ "success": false, "message": "Something went wrong", "errors": [] }
```

Paginated endpoints add `meta.pagination`:

```json
{
  "success": true,
  "data": [],
  "meta": {
    "pagination": {
      "page": 1, "limit": 20, "totalItems": 87, "totalPages": 5,
      "hasNextPage": true, "hasPrevPage": false
    }
  }
}
```

### Authentication

Send the access token as a bearer header:

```
Authorization: Bearer <accessToken>
```

Access tokens last 15 minutes. The refresh token is set as an httpOnly cookie
and can also be passed in the body of `/auth/refresh`.

### Status codes

| Code | Meaning |
|---|---|
| 200 | Success |
| 201 | Created |
| 400 | Bad request — a business rule was violated |
| 401 | Not authenticated, or the token expired |
| 403 | Authenticated but not permitted |
| 404 | Not found |
| 409 | Conflict — duplicate, or a scheduling clash |
| 422 | Validation failed (`errors` lists the fields) |
| 429 | Rate limited |
| 500 | Server error |
| 503 | Database unavailable |

### Roles

`admin`, `teacher`, `student`, `parent`. The **Access** column below shows which
roles may call an endpoint; scoping *within* a role (a teacher's own classes, a
parent's linked children) is applied on top.

---

## Authentication — `/api/auth`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/register` | Public | Self-register (student or parent only) |
| POST | `/login` | Public | Sign in |
| POST | `/refresh` | Public | Exchange a refresh token; rotates it |
| POST | `/logout` | Public | Revoke the current refresh token |
| POST | `/forgot-password` | Public | Request a reset link |
| POST | `/reset-password` | Public | Consume a reset token |
| GET | `/me` | All | Current user, profile and permissions |
| GET | `/sessions` | All | Active sessions for this account |
| POST | `/logout-all` | All | Revoke every session |
| POST | `/change-password` | All | Change password (revokes all sessions) |
| PATCH | `/profile` | All | Update name, phone, avatar, role fields |
| PATCH | `/preferences` | All | Notification and theme preferences |

**POST `/register`**

```json
{
  "name": "Ananya Sharma",
  "email": "ananya@institution.edu",
  "password": "Str0ngPass",
  "confirmPassword": "Str0ngPass",
  "role": "student",
  "phone": "+91 98765 43210"
}
```

Returns `201` with `{ user, accessToken, refreshToken, expiresIn }`.
Passwords need 8+ characters with an uppercase letter, a lowercase letter and a
number. `role` must be `student` or `parent` — staff accounts are provisioned by
an administrator.

**POST `/login`**

```json
{ "email": "student@smartedu.demo", "password": "Demo@12345" }
```

Returns the same shape. A wrong password and an unknown e-mail produce an
identical `401`, deliberately.

**Errors** — `401` incorrect credentials · `403` account deactivated ·
`409` e-mail already registered · `422` validation failed · `429` too many attempts

---

## Users — `/api/users`

Administrator only.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | List users. Query: `page`, `limit`, `role`, `status`, `classId`, `departmentId`, `search` |
| GET | `/:id` | One user with profile |
| POST | `/` | Create an account of any role |
| PATCH | `/:id` | Update. Roles are immutable after creation |
| DELETE | `/:id` | Delete (cascades). Cannot delete yourself or the last admin |
| POST | `/:id/reset-password` | Set a new password; revokes their sessions |
| GET | `/parent-links` | Every parent↔student link |
| POST | `/link-parent` | Link a parent to a student |
| DELETE | `/link-parent/:id` | Remove a link |

**POST `/`** — omit `password` and a temporary one is generated and returned
**once** in `data.temporaryPassword`. It is never stored in readable form.

---

## Students — `/api/students`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/` | teacher, admin | List students (teachers see only their classes) |
| GET | `/:studentId` | All* | Full profile with `visibleScopes` |
| GET | `/:studentId/marks` | All* | Marks |
| GET | `/:studentId/attendance` | All* | Attendance detail |
| POST | `/:studentId/remarks` | teacher, admin | Add a remark |

\* Subject to `accessService`: a student may only reach their own record, a
teacher only students they teach, a parent only linked children within the
categories that child shares.

---

## Parents — `/api/parents`

Parent only.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/children` | Linked children with their effective permission flags |
| GET | `/dashboard` | Dashboard for one child. Query: `studentId` |
| GET | `/children/:studentId/:section` | `attendance`, `marks`, `assignments` or `performance` |

Returns `403` with an explanatory message when the student has withheld the
requested category.

---

## Teachers — `/api/teachers`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/` | teacher, admin | Directory |
| GET | `/me/classes` | teacher, admin | Own class × subject assignments |
| GET | `/me/students` | teacher, admin | Every student they are responsible for |
| GET | `/:id` | teacher, admin | Profile plus workload |

---

## Academic structure

### Departments — `/api/departments`

| Method | Endpoint | Access |
|---|---|---|
| GET | `/` | All |
| POST | `/` | admin + `manage_departments` |
| PATCH | `/:id` | admin + `manage_departments` |
| DELETE | `/:id` | admin + `manage_departments` |

### Classes — `/api/classes`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/` | All | Teachers see their own unless `scope=all` |
| GET | `/:id` | All* | Class with roster and subjects |
| POST | `/` | admin | Create |
| PATCH | `/:id` | admin | Update |
| DELETE | `/:id` | admin | Refused while students are enrolled |
| POST | `/:id/students` | admin | Enroll a student (transactional) |

### Subjects — `/api/subjects`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/` | All | Students see their class's subjects |
| GET | `/assignments` | teacher, admin | The teacher × subject × class matrix |
| POST | `/` | admin | Create |
| POST | `/assign` | admin | Assign a teacher — this is what grants classroom access |
| DELETE | `/assign/:id` | admin | Remove an assignment |
| PATCH | `/:id` | admin | Update |
| DELETE | `/:id` | admin | Delete |

---

## Attendance — `/api/attendance`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/` | All* | Paginated records. Query: `studentId`, `from`, `to`, `subjectId` |
| GET | `/summary` | All* | Overall, subject-wise and monthly trend |
| GET | `/register` | teacher, admin | Marking sheet. Query: `classId`, `subjectId`, `date` |
| GET | `/low` | teacher, admin | Students below the threshold |
| GET | `/class/:classId` | teacher, admin | Class overview |
| POST | `/` | teacher, admin + `edit_attendance` | Submit a register |
| PATCH | `/:id` | teacher, admin + `edit_attendance` | Amend one record |

**POST `/`**

```json
{
  "classId": "uuid",
  "subjectId": "uuid",
  "date": "2026-08-24",
  "records": [
    { "studentId": "uuid", "status": "present" },
    { "studentId": "uuid", "status": "absent", "remarks": "Unwell" }
  ]
}
```

The whole register is one transaction. Re-submitting the same date **updates**
the existing rows rather than failing — the change is audited. `status` is
`present`, `absent` or `late`; late counts as attended for the percentage.

**Errors** — `400` a student is not enrolled in that class · `403` you do not
teach that subject in that class · `422` future date or invalid status

---

## Marks — `/api/marks`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/` | All* | Published marks. Query: `studentId`, `subjectId`, `type` |
| GET | `/performance` | All* | Subject averages, CGPA, rank, trend |
| GET | `/assessments` | All | Assessments (staff also see drafts) |
| GET | `/declining` | teacher, admin | Students whose scores are dropping |
| GET | `/class/:classId` | teacher, admin | Class performance |
| POST | `/assessments` | teacher, admin + `edit_marks` | Create an assessment |
| GET | `/assessments/:id/sheet` | teacher, admin | Marks entry grid |
| POST | `/assessments/:id/marks` | teacher, admin + `edit_marks` | Bulk entry |
| POST | `/assessments/:id/publish` | teacher, admin + `publish_marks` | Publish |

**POST `/assessments/:id/marks`**

```json
{
  "records": [
    { "studentId": "uuid", "marksObtained": 42 },
    { "studentId": "uuid", "isAbsent": true }
  ]
}
```

Marks are validated against the assessment's own `max_marks` — the only place
that value is known.

**POST `/assessments/:id/publish`** refuses while any student has no mark, so
half a class cannot see a blank result. On success every student and every
permitted parent is notified.

---

## Assignments — `/api/assignments`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/` | All | Role-aware listing. Query: `status`, `classId`, `subjectId` |
| GET | `/stats` | teacher, admin | Completion statistics |
| GET | `/:id` | All* | Detail; students also get their submission |
| POST | `/` | teacher, admin | Create (multipart accepts `attachment`) |
| PATCH | `/:id` | teacher, admin | Update (own assignments only) |
| DELETE | `/:id` | teacher, admin | Delete |
| GET | `/:id/submissions` | teacher, admin | Every student, submitted or not |
| POST | `/:id/submit` | student | Submit (multipart accepts `file`) |

Derived status: `pending`, `overdue`, `submitted`, `late`, `graded`. A
submission after the deadline is accepted and flagged `late` — the teacher
decides what it is worth.

### Submissions — `/api/submissions`

| Method | Endpoint | Access |
|---|---|---|
| POST | `/:id/grade` | teacher, admin + `manage_assignments` |

```json
{ "marks": 18, "feedback": "Strong work — the reasoning is clear." }
```

---

## Timetable — `/api/timetable`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/` | All | Weekly grid, grouped by day |
| GET | `/today` | All | Today's periods, with `isCurrent` |
| GET | `/conflicts` | admin | Audit the whole timetable |
| POST | `/` | admin + `manage_timetable` | Add a period |
| PATCH | `/:id` | admin + `manage_timetable` | Update |
| DELETE | `/:id` | admin + `manage_timetable` | Remove |

Creating or updating a period checks for teacher **and** class overlaps and
returns `409` with the clashing entries rather than creating a broken schedule.

---

## Exams — `/api/exams`

| Method | Endpoint | Access |
|---|---|---|
| GET | `/` | All |
| POST | `/` | teacher, admin |
| DELETE | `/:id` | teacher, admin |

---

## Notices — `/api/notices`

| Method | Endpoint | Access |
|---|---|---|
| GET | `/` | All (filtered by audience) |
| GET | `/:id` | All |
| POST | `/` | teacher, admin + `manage_notices` |
| PATCH | `/:id` | Author or admin |
| DELETE | `/:id` | Author or admin |

Targeting: no `targetRole` and no `classId` reaches everyone; `targetRole`
narrows to a role; `classId` narrows to a class. Expired notices drop out
automatically.

---

## Notifications — `/api/notifications`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | Paginated. Query: `unreadOnly`, `type` |
| GET | `/unread-count` | Badge count for the navbar bell |
| PATCH | `/:id/read` | Mark one as read |
| PATCH | `/read-all` | Mark all as read |
| DELETE | `/:id` | Remove one |
| DELETE | `/` | Clear all |

Every query is scoped to the authenticated user — there is no cross-user read.

---

## Complaints — `/api/complaints`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/` | student, admin | Students see their own named complaints |
| GET | `/stats` | admin | Counts by status and category |
| GET | `/track/:code` | All | Look up by tracking code |
| POST | `/` | student | File a complaint |
| PATCH | `/:id` | admin + `manage_complaints` | Triage |

**Anonymity is real.** With `isAnonymous: true` the `student_id` column is
`NULL` — there is no stored link between the complaint and its author, so
anonymous complaints never appear in the student's own list. The tracking code
returned on creation is the only route back to it, and it is shown once.

---

## Leave — `/api/leave`

| Method | Endpoint | Access |
|---|---|---|
| GET | `/` | All (scoped by role) |
| POST | `/` | student |
| PATCH | `/:id/review` | teacher, admin + `manage_leave` |
| DELETE | `/:id` | student (own pending only) |

Overlapping applications are refused. Reviewing notifies the student and any
parent permitted to see attendance.

---

## Fees and payments

### `/api/fees`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/` | All* | Fee records and payment history |
| GET | `/overview` | admin | Collection summary by class |
| GET | `/structures` | admin | Fee structures |
| POST | `/structures` | admin + `manage_fees` | Create and raise records |

### `/api/payments`

| Method | Endpoint | Access |
|---|---|---|
| POST | `/` | student, parent, admin |
| POST | `/verify` | student, parent, admin |

A two-step, provider-shaped flow. Without Razorpay keys the mock provider
settles immediately and the response says `mockMode: true`. With keys, the HMAC
signature is verified in constant time before any amount is credited.

---

## Parent-teacher meetings — `/api/ptm`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/slots` | parent, teacher, admin | Parents see open slots from their children's teachers |
| POST | `/slots` | teacher | Publish availability |
| DELETE | `/slots/:id` | teacher, admin | Remove (refused while booked) |
| GET | `/bookings` | All (scoped) | Meetings |
| POST | `/bookings` | parent | Request a meeting |
| PATCH | `/bookings/:id` | Participants | Confirm, reschedule, cancel, complete |

Booking locks the slot row, so two parents cannot win the same slot.

---

## Privacy — `/api/privacy`

**Student only.** These settings belong to the student; no other role can read
or change them.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | Master switch, linked parents, per-parent flags |
| PATCH | `/` | Update settings |
| DELETE | `/parents/:parentId` | Revoke a parent link entirely |

**PATCH `/`**

```json
{
  "parentPermissionEnabled": true,
  "parentId": "uuid",
  "canViewAttendance": true,
  "canViewMarks": false,
  "canViewCgpa": false,
  "canViewAssignments": true,
  "canViewReports": true,
  "canViewFees": true
}
```

Omit `parentId` to apply the change to every linked parent. Affected parents
are notified that visibility changed.

---

## Reports — `/api/reports`

| Method | Endpoint | Access |
|---|---|---|
| GET | `/student/:studentId` | All* |
| GET | `/class/:classId` | teacher, admin + `view_reports` |
| GET | `/teacher/:teacherId` | teacher (own), admin |
| GET | `/institution` | admin + `view_reports` |

`teacherId` accepts `me`.

---

## Analytics — `/api/analytics`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/student` | All* | Student dashboard payload |
| GET | `/teacher` | teacher, admin | Teacher dashboard payload |
| GET | `/admin` | admin | Institutional dashboard |
| GET | `/attendance` | teacher, admin | Attendance analytics |
| GET | `/academic` | teacher, admin | Performance analytics |
| GET | `/risk` | teacher, admin | Risk register with methodology |
| GET | `/student/:studentId/risk` | All* | One student's risk detail |

The risk indicator is a weighted blend — attendance 40%, performance 40%,
assignments 20% — and every response ships its own `breakdown`, `factors` and
`disclaimer`. It flags students for a human conversation; it is not a validated
predictive model.

---

## Search — `/api/search`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | Global search. Query: `q` (2+ chars), `limit` |

Results differ by role and are scoped in SQL: admins search users, classes and
subjects; teachers their own students and assignments; students their
assignments, subjects and notices; parents their children and notices.

---

## Administration — `/api/admin`

Administrator only.

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| GET | `/permissions` | `manage_permissions` | Catalogue and role defaults |
| GET | `/permissions/:userId` | `manage_permissions` | Effective permissions |
| PATCH | `/permissions/:userId` | `manage_permissions` | Grant or revoke |
| GET | `/settings` | — | Settings and runtime status |
| PUT | `/settings/:key` | `manage_settings` | Update a setting |
| GET | `/audit-logs` | `view_audit_logs` | Paginated audit trail |
| GET | `/audit-logs/actions` | `view_audit_logs` | Distinct actions, for filters |
| GET | `/system` | — | Health and record counts |
| POST | `/recalculate-fees` | `manage_fees` | Refresh overdue flags |

A per-user permission row is only stored when it **differs** from the role
baseline; setting it back to the default clears the override.

---

## AI — `/api/ai`

Requires the `use_ai_tools` permission (all roles have it by default).

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/status` | All | Provider and RAG configuration |
| GET | `/suggestions` | All | Role-specific starter prompts |
| POST | `/chat` | All | Chat with the role's agent |
| GET | `/conversations` | All | Conversation history |
| GET | `/conversations/:id` | All | One conversation |
| DELETE | `/conversations/:id` | All | Delete |
| POST | `/study-plan` | student | Generate a study plan |
| GET | `/insights` | All* | Progress-page insights |
| POST | `/quiz` | teacher, admin | Generate a quiz with an answer key |
| POST | `/assignment` | teacher, admin | Generate an assignment with a rubric |
| POST | `/question-paper` | teacher, admin | Generate a sectioned exam paper |
| POST | `/search` | teacher, admin | Natural-language student search |
| GET | `/generated` | teacher, admin | Saved content |
| POST | `/generated` | teacher, admin | Save generated content |
| DELETE | `/generated/:id` | teacher, admin | Delete saved content |
| GET | `/documents` | All | Study material visible to you |
| POST | `/documents` | teacher, admin | Upload and index a document |
| DELETE | `/documents/:id` | Owner or admin | Delete |
| POST | `/retrieve` | All | Retrieval preview |

**POST `/chat`**

```json
{
  "message": "How am I doing this term?",
  "conversationId": "uuid",
  "context": { "studentId": "uuid" }
}
```

The agent is chosen from the caller's role — a client cannot request another
role's agent. Context is assembled through the same access layer the REST API
uses, so the AI cannot describe anything the caller could not fetch themselves.

**POST `/search`**

```json
{ "query": "Show students below 75% attendance" }
```

The phrase is parsed into a fixed intent, which maps to a hand-written
parameterised query. **AI-generated SQL is never executed.** An unrecognised
phrase returns `understood: false` with worked examples, not a guess.

Supported intents: low attendance, high attendance, struggling in a subject,
declining marks, pending assignments, at-risk students, top performers.

---

## Rate limits

| Scope | Window | Limit |
|---|---|---|
| All `/api` routes | 15 min | 500 per IP |
| Login, register, reset | 15 min | 25 per IP + e-mail (successes not counted) |
| Forgot password | 1 hour | 5 per IP |
| AI endpoints | 1 min | 30 per user |

Exceeding a limit returns `429` in the standard error envelope.

---

## File uploads

Multipart endpoints accept files up to **10MB**, at most 5 per request.

Allowed: `.pdf .doc .docx .txt .md .rtf .odt .png .jpg .jpeg .gif .webp
.ppt .pptx .xls .xlsx .csv .zip`

Filenames are never reused — every upload is stored under a generated name to
prevent path traversal and collisions. Files are served from `/uploads`.

| Endpoint | Field |
|---|---|
| `POST /api/assignments` | `attachment` |
| `POST /api/assignments/:id/submit` | `file` |
| `POST /api/complaints` | `attachment` |
| `POST /api/leave` | `attachment` |
| `POST /api/ai/documents` | `file` |

---

## Health

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Liveness — no database call |
| GET | `/api/health` | Readiness — database and AI provider status |

`/api/health` returns `503` when the database is unreachable.
