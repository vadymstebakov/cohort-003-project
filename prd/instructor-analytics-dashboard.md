# Instructor Analytics Dashboard — PRD

## Problem Statement

Instructors on Cadence have no visibility into how their courses are performing. They can see a student roster with individual progress, but there is no aggregated view of revenue trends, enrollment growth, completion rates, quiz performance, or where students are dropping off. Without these insights, instructors cannot identify underperforming content, understand their revenue trajectory, or make data-driven decisions about course improvements.

## Solution

Add a cross-course analytics dashboard at `/instructor/analytics` that gives instructors (and admins) a single page with key performance metrics across all their courses. The dashboard includes:

- **Revenue trends** — total revenue and a time-series chart filterable by date range.
- **Enrollment numbers** — total enrollments, new enrollments over time, and per-course breakdown.
- **Completion rates** — percentage of students who complete each course.
- **Quiz pass rates** — course-level summary of average quiz scores and pass rates.
- **Drop-off analysis** — lesson-by-lesson and module-level funnels showing where students stop progressing, plus segments (never started, in progress, abandoned, completed).

All metrics are filterable by a custom date range picker.

## User Stories

1. As an instructor, I want to see a single dashboard aggregating analytics across all my courses, so that I can understand my overall performance at a glance.
2. As an instructor, I want to see my total revenue and a trend line over time, so that I can track income growth or decline.
3. As an instructor, I want to filter all metrics by a custom date range, so that I can analyze performance for specific periods (e.g., after a launch or promotion).
4. As an instructor, I want to see total enrollment counts across all my courses, so that I know how many students I'm reaching.
5. As an instructor, I want to see new enrollments over time as a chart, so that I can identify enrollment spikes or drops.
6. As an instructor, I want to see per-course enrollment numbers, so that I can compare which courses attract the most students.
7. As an instructor, I want to see completion rates per course, so that I can identify courses where students aren't finishing.
8. As an instructor, I want to see a lesson-by-lesson funnel for each course, so that I can pinpoint exactly where students drop off.
9. As an instructor, I want to see a module-level funnel for each course, so that I can identify which sections lose the most students.
10. As an instructor, I want to see student segments (never started, in progress, abandoned, completed) for each course, so that I can understand engagement patterns.
11. As an instructor, I want to see course-level quiz pass rates and average scores, so that I can gauge whether my assessments are appropriately difficult.
12. As an instructor, I want to distinguish between students who enrolled but never started and those who started but abandoned, so that I can tailor my re-engagement strategy.
13. As an instructor, I want the dashboard to load quickly even with many courses and students, so that I don't waste time waiting for data.
14. As an instructor, I want to navigate to the analytics dashboard from the main instructor sidebar, so that it's easily discoverable.
15. As an admin, I want to view any instructor's analytics dashboard, so that I can monitor platform-wide course performance.
16. As an admin, I want to select which instructor's analytics I'm viewing, so that I can compare instructors or investigate issues.
17. As an instructor, I want to see summary cards at the top of the dashboard (total revenue, total enrollments, average completion rate, average quiz pass rate), so that I get key numbers immediately.
18. As an instructor, I want the revenue trend chart to show data at appropriate granularity (daily for short ranges, weekly/monthly for longer ranges), so that the chart remains readable.
19. As an instructor, I want to see which course has the highest drop-off rate, so that I can prioritize improvements.
20. As an instructor, I want the "abandoned" segment to be defined clearly (e.g., enrolled > 14 days ago, started but < 25% complete, no activity in 14 days), so that I can trust the metric.

## Implementation Decisions

### Route & Navigation

- New route: `/instructor/analytics` — a cross-course aggregate dashboard.
- Add a sidebar link in the instructor layout ("Analytics" with a chart icon from Lucide).
- Admins access the same route; if the user is an admin, show an instructor selector dropdown at the top.

### Data Loading

- Standard React Router loader fetches all analytics data on page load (no live-updating).
- The loader accepts optional `from` and `to` search params for date filtering.
- All queries are scoped to the instructor's courses (via `courses.instructorId`).

### Charting

- Install **Recharts** as the charting library.
- Use shadcn-compatible chart wrapper components.
- Charts: line chart for revenue trend, line/bar chart for enrollment trend, horizontal bar/funnel chart for drop-off analysis.

### Summary Cards

- Top of page: 4 summary cards showing total revenue, total enrollments, average completion rate, and average quiz pass rate.
- Cards update when the date range filter changes.

### Revenue Section

- Total revenue number + line chart showing revenue over time.
- No breakdown by coupon or PPP — just total and trend.
- Granularity auto-adjusts: daily for ranges under 90 days, weekly for 90-365 days, monthly for 365+ days.

### Enrollment Section

- Total enrollments + trend chart.
- Per-course enrollment table (course name, enrollment count, sorted descending).

### Completion Rates Section

- Per-course completion rate displayed as a table or card grid (course name, % completed, total enrolled).
- Completion = student has a non-null `completedAt` on their enrollment record.

### Drop-off Analysis Section

- Expandable per-course section.
- **Lesson-by-lesson funnel**: For each course, show a stepped funnel/bar chart where each bar is a lesson (in order), and the height represents the % of enrolled students who completed that lesson.
- **Module-level funnel**: Same concept but aggregated at the module level (% of enrolled students who completed all lessons in that module).
- **Segments**: For each course, show a pie/donut chart or stat cards breaking students into:
  - **Never started**: Enrolled but zero lesson completions.
  - **In progress**: At least one lesson completed, enrolled within last 14 days OR had activity in last 14 days.
  - **Abandoned**: At least one lesson completed, but less than 100% progress, no activity in 14+ days, enrolled more than 14 days ago.
  - **Completed**: Enrollment has `completedAt` set.

### Quiz Performance Section

- Course-level summary: table with course name, number of quizzes, average pass rate (% of attempts that passed), average score.
- Aggregated from `quizAttempts` — uses best attempt per student per quiz for pass rate calculation.

### Date Range Filter

- A date range picker component (from/to) at the top of the dashboard.
- Filters apply to: revenue (by `purchases.createdAt`), enrollments (by `enrollments.enrolledAt`), quiz attempts (by `quizAttempts.attemptedAt`).
- Completion rates and drop-off use all-time data for enrolled students but can be scoped to students who enrolled within the date range.

### Authorization

- Instructors see only their own courses' data.
- Admins can view any instructor's data via an instructor selector dropdown.
- Unauthorized access redirects to `/instructor`.

### Analytics Service

- Create a new `analyticsService` module that encapsulates all the aggregate queries needed by the dashboard.
- Queries should be efficient — use SQL aggregations (COUNT, AVG, SUM, GROUP BY) rather than fetching all rows and aggregating in JS.
- This service should have accompanying tests per the project convention.

## Out of Scope

- Per-course analytics pages (only cross-course aggregate for now).
- Revenue breakdowns by coupon, PPP/country, or individual purchase logs.
- Export/download of analytics data (CSV, PDF).
- Email reports or scheduled digests.
- Real-time or live-updating metrics.
- Student-facing analytics or progress insights beyond what already exists.
- Comparison between time periods (e.g., this month vs. last month).
- Video engagement analytics (watch time, rewatch rates) — despite `videoWatchEvents` data being available.

## Further Notes

- The "abandoned" student definition (14-day inactivity threshold) is a starting point. This threshold could be made configurable in a future iteration.
- The existing student roster page at `/instructor/:courseId/students` remains unchanged — it serves a different purpose (individual student detail vs. aggregate analytics).
- Recharts will be the first charting dependency added to the project. Keep the chart components simple and reusable in case other dashboards are added later.
- The `analyticsService` should be designed with testability in mind — all date boundaries should be passable as parameters rather than using `Date.now()` internally.
