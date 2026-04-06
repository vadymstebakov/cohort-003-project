# Instructor Analytics Dashboard — Implementation Plan

## Phase 1: Foundation — Route, Layout & Analytics Service Skeleton

**Goal**: Get the page accessible, authorized, and wired into navigation with empty sections.

- [ ] Add `/instructor/analytics` route in the React Router config
- [ ] Add "Analytics" sidebar link (chart icon from Lucide) to instructor layout
- [ ] Create the page component with placeholder sections (summary cards, revenue, enrollment, completion, drop-off, quiz)
- [ ] Implement authorization: instructors see own data; admins get an instructor selector dropdown; unauthorized users redirect to `/instructor`
- [ ] Create `analytics-service.ts` module with stub functions for each data category
- [ ] Create `analytics-service.test.ts` with initial test structure

## Phase 2: Summary Cards & Date Range Filter

**Goal**: Top-of-page KPIs and the date filter that drives the entire dashboard.

- [ ] Build the date range picker component (from/to) using existing shadcn primitives
- [ ] Wire date range into URL search params (`from`, `to`) so the loader can read them
- [ ] Implement `getRevenueSummary` in analytics service — `SUM(purchases.amount)` scoped to instructor's courses and date range
- [ ] Implement `getEnrollmentSummary` — `COUNT(enrollments)` scoped by date range
- [ ] Implement `getAverageCompletionRate` — % of enrollments with non-null `completedAt` (students enrolled within date range)
- [ ] Implement `getAverageQuizPassRate` — best attempt per student per quiz, % that passed (attempts within date range)
- [ ] Build 4 summary card UI components (total revenue, total enrollments, avg completion rate, avg quiz pass rate)
- [ ] Write service tests for each summary query (edge cases: no data, single course, multiple courses)

## Phase 3: Revenue & Enrollment Sections

**Goal**: Time-series charts and per-course enrollment breakdown.

- [ ] Install Recharts (`pnpm add recharts`)
- [ ] Create reusable shadcn-compatible chart wrapper components (line chart, bar chart)
- [ ] Implement `getRevenueTrend` — time-series aggregation with auto-granularity (daily < 90d, weekly 90-365d, monthly 365d+)
- [ ] Build revenue section UI: total number + line chart
- [ ] Implement `getEnrollmentTrend` — time-series of new enrollments with same granularity logic
- [ ] Implement `getPerCourseEnrollments` — enrollment count per course, sorted descending
- [ ] Build enrollment section UI: trend chart + per-course table
- [ ] Write service tests for trend queries (verify granularity switching, date boundaries)

## Phase 4: Completion Rates & Drop-off Analysis

**Goal**: Per-course completion rates and the lesson/module funnels with student segments.

- [ ] Implement `getCompletionRates` — per-course: course name, % completed, total enrolled (scoped to enrollments within date range)
- [ ] Build completion rates UI: table or card grid
- [ ] Implement `getLessonFunnel` — per course, ordered lessons with % of enrolled students who completed each
- [ ] Implement `getModuleFunnel` — per course, modules with % of enrolled students who completed all lessons in each module
- [ ] Implement `getStudentSegments` — per course, counts for: never started, in progress, abandoned (14-day inactivity, <100% progress, enrolled >14 days ago), completed
- [ ] Build drop-off section UI: expandable per-course sections with funnel bar charts and segment donut/stat cards
- [ ] Write service tests for funnels and segments (test boundary conditions on the 14-day abandoned threshold)

## Phase 5: Quiz Performance & Polish

**Goal**: Quiz analytics, performance optimization, and final polish.

- [ ] Implement `getQuizPerformance` — per course: course name, quiz count, average pass rate, average score (best attempt per student per quiz)
- [ ] Build quiz performance section UI: summary table
- [ ] Performance audit: ensure all service queries use SQL aggregations (no fetch-all-then-aggregate)
- [ ] Add loading states / skeletons for each dashboard section
- [ ] Test full page with realistic data volumes
- [ ] Verify admin instructor-selector dropdown works end-to-end
- [ ] Final review of all analytics service tests for completeness
