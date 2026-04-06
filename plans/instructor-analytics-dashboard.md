# Plan: Instructor Analytics Dashboard

> Source PRD: `prd/instructor-analytics-dashboard.md`

## Architectural decisions

Durable decisions that apply across all phases:

- **Route**: `/instructor/analytics` — a new top-level instructor route (not nested under `$courseId`)
- **Navigation**: Sidebar link labeled "Analytics" with a Lucide chart icon, added to the instructor section of the app sidebar
- **Authorization**: Instructors see only their own courses' data (scoped via `courses.instructorId`). Admins can view any instructor's data via a selector dropdown. Unauthorized access redirects to `/instructor`.
- **Data loading**: Standard React Router loader; accepts optional `from` and `to` search params for date filtering. No live-updating.
- **Analytics service**: New `analyticsService` module encapsulating all aggregate queries. Uses SQL aggregations (COUNT, AVG, SUM, GROUP BY) via Drizzle. All date boundaries passed as parameters (no internal `Date.now()`). Accompanied by tests using `createTestDb()` / `seedBaseData()`.
- **Charting**: Recharts library, installed as a new dependency.
- **Date scoping**: Revenue filtered by `purchases.createdAt`, enrollments by `enrollments.enrolledAt`, quiz attempts by `quizAttempts.attemptedAt`. Completion rates and drop-off default to all-time but can scope to students enrolled within the date range.
- **Student segments**: Never started (zero lesson completions), In progress (started, enrolled < 14 days ago OR active in last 14 days), Abandoned (started, < 100% progress, no activity 14+ days, enrolled 14+ days ago), Completed (`completedAt` set).

---

## Phase 1: Route Shell + Summary Cards

**User stories**: 1, 2, 4, 14, 17

### What to build

Add the `/instructor/analytics` route with proper authorization (instructor/admin check). Add a sidebar link to the instructor layout. Create the `analyticsService` with queries for total revenue, total enrollments, average completion rate, and average quiz pass rate — all scoped to the instructor's courses and filterable by date range. The route renders four summary cards at the top of the page displaying these metrics. Write tests for the analytics service.

### Acceptance criteria

- [ ] `/instructor/analytics` route exists and is accessible to instructors
- [ ] Sidebar shows an "Analytics" link with a chart icon in the instructor section
- [ ] Non-instructors/non-admins are redirected to `/instructor`
- [ ] Four summary cards display: total revenue, total enrollments, average completion rate, average quiz pass rate
- [ ] Loader accepts `from` and `to` search params and passes them to the service
- [ ] `analyticsService` exists with functions for each summary metric
- [ ] `analyticsService` has passing tests covering aggregation logic and date filtering

---

## Phase 2: Charts, Enrollment Table, Completion Rates & Quiz Performance

**User stories**: 3, 5, 6, 7, 11, 18

### What to build

Install Recharts. Add a date range picker component at the top of the dashboard that updates `from`/`to` search params. Build a revenue section with a total revenue number and a line chart showing revenue over time with auto-adjusting granularity (daily < 90 days, weekly 90-365 days, monthly 365+ days). Build an enrollment section with total enrollments, a trend chart, and a per-course enrollment table sorted descending. Add a completion rates section showing per-course completion rate (course name, % completed, total enrolled). Add a quiz performance section with a table showing course name, number of quizzes, average pass rate (based on best attempt per student per quiz), and average score. Extend the analytics service and tests to cover all new queries.

### Acceptance criteria

- [ ] Recharts is installed and used for all charts
- [ ] Date range picker is rendered at the top and updates search params on change
- [ ] Revenue line chart renders with correct auto-granularity based on date range
- [ ] Enrollment trend chart renders over time
- [ ] Per-course enrollment table shows course name and enrollment count, sorted descending
- [ ] Per-course completion rate table/cards show course name, % completed, total enrolled
- [ ] Quiz performance table shows course name, quiz count, average pass rate, average score
- [ ] All new analytics service functions have passing tests

---

## Phase 3: Drop-off Analysis

**User stories**: 8, 9, 10, 12, 19, 20

### What to build

Add an expandable per-course drop-off analysis section. For each course, show a lesson-by-lesson funnel (bar chart where each bar is a lesson in order, height = % of enrolled students who completed it). Show a module-level funnel (same concept aggregated at the module level). Show student segment breakdown (never started, in progress, abandoned, completed) as a chart or stat cards using the defined segment rules. Highlight the course with the highest drop-off. Extend the analytics service with funnel and segment queries, with tests.

### Acceptance criteria

- [ ] Each course has an expandable section in the drop-off analysis area
- [ ] Lesson-by-lesson funnel chart renders with lessons in order, showing % completion per lesson
- [ ] Module-level funnel chart renders showing % of students completing all lessons in each module
- [ ] Student segments (never started, in progress, abandoned, completed) are displayed per course
- [ ] "Abandoned" uses the defined threshold: enrolled > 14 days ago, started but < 100% progress, no activity in 14+ days
- [ ] Course with the highest drop-off rate is identifiable
- [ ] All funnel and segment service functions have passing tests

---

## Phase 4: Admin Instructor Selector

**User stories**: 15, 16

### What to build

When the logged-in user is an admin, show an instructor selector dropdown at the top of the dashboard. The dropdown lists all instructors on the platform. Selecting an instructor reloads the dashboard with that instructor's data. The selected instructor is passed as a search param so it persists with the date range filter.

### Acceptance criteria

- [ ] Admin users see an instructor selector dropdown at the top of the dashboard
- [ ] Dropdown lists all users with the instructor role
- [ ] Selecting an instructor reloads the dashboard scoped to that instructor's courses
- [ ] The selected instructor persists as a search param alongside date range
- [ ] Non-admin users do not see the instructor selector

---

## Phase 5: Performance & Polish

**User stories**: 13

### What to build

Add a `HydrateFallback` with skeleton loading states for all dashboard sections. Review and optimize analytics queries for performance with large datasets (ensure proper use of SQL aggregations, avoid N+1 queries). Verify the dashboard loads acceptably with many courses and students.

### Acceptance criteria

- [ ] Skeleton loading state renders while data loads
- [ ] No N+1 query patterns in the analytics service
- [ ] All aggregate queries use SQL-level aggregation (not JS-level)
- [ ] Dashboard loads without noticeable delay with realistic data volumes
