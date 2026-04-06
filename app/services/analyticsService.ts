import { eq, and, sql, gte, lte, inArray } from "drizzle-orm";
import { db } from "~/db";
import {
  courses,
  enrollments,
  purchases,
  quizzes,
  quizAttempts,
  lessons,
  modules,
} from "~/db/schema";

// ─── Analytics Service ───
// Aggregated analytics queries for the instructor dashboard.
// All date boundaries are passed as parameters (no internal Date.now()).
// Uses SQL-level aggregation for performance.

export interface DateRange {
  from?: string;
  to?: string;
}

export interface TrendDataPoint {
  period: string;
  value: number;
}

export type Granularity = "daily" | "weekly" | "monthly";

export interface CourseEnrollmentRow {
  courseId: number;
  courseTitle: string;
  enrollmentCount: number;
}

export interface CourseCompletionRow {
  courseId: number;
  courseTitle: string;
  totalEnrolled: number;
  completedCount: number;
  completionRate: number;
}

export interface CourseQuizPerformanceRow {
  courseId: number;
  courseTitle: string;
  quizCount: number;
  averagePassRate: number;
  averageScore: number;
}

function getCourseIdsForInstructor(instructorId: number): number[] {
  const rows = db
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.instructorId, instructorId))
    .all();

  return rows.map((r) => r.id);
}

export function getTotalRevenue(opts: {
  instructorId: number;
  dateRange?: DateRange;
}): number {
  const courseIds = getCourseIdsForInstructor(opts.instructorId);
  if (courseIds.length === 0) return 0;

  const conditions = [inArray(purchases.courseId, courseIds)];

  if (opts.dateRange?.from) {
    conditions.push(gte(purchases.createdAt, opts.dateRange.from));
  }
  if (opts.dateRange?.to) {
    conditions.push(lte(purchases.createdAt, opts.dateRange.to));
  }

  const result = db
    .select({ total: sql<number>`coalesce(sum(${purchases.pricePaid}), 0)` })
    .from(purchases)
    .where(and(...conditions))
    .get();

  return result?.total ?? 0;
}

export function getTotalEnrollments(opts: {
  instructorId: number;
  dateRange?: DateRange;
}): number {
  const courseIds = getCourseIdsForInstructor(opts.instructorId);
  if (courseIds.length === 0) return 0;

  const conditions = [inArray(enrollments.courseId, courseIds)];

  if (opts.dateRange?.from) {
    conditions.push(gte(enrollments.enrolledAt, opts.dateRange.from));
  }
  if (opts.dateRange?.to) {
    conditions.push(lte(enrollments.enrolledAt, opts.dateRange.to));
  }

  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(enrollments)
    .where(and(...conditions))
    .get();

  return result?.count ?? 0;
}

export function getAverageCompletionRate(opts: {
  instructorId: number;
  dateRange?: DateRange;
}): number {
  const courseIds = getCourseIdsForInstructor(opts.instructorId);
  if (courseIds.length === 0) return 0;

  const conditions = [inArray(enrollments.courseId, courseIds)];

  if (opts.dateRange?.from) {
    conditions.push(gte(enrollments.enrolledAt, opts.dateRange.from));
  }
  if (opts.dateRange?.to) {
    conditions.push(lte(enrollments.enrolledAt, opts.dateRange.to));
  }

  const result = db
    .select({
      total: sql<number>`count(*)`,
      completed: sql<number>`sum(case when ${enrollments.completedAt} is not null then 1 else 0 end)`,
    })
    .from(enrollments)
    .where(and(...conditions))
    .get();

  if (!result || result.total === 0) return 0;

  return Math.round((result.completed / result.total) * 100);
}

export function getAverageQuizPassRate(opts: {
  instructorId: number;
  dateRange?: DateRange;
}): number {
  const courseIds = getCourseIdsForInstructor(opts.instructorId);
  if (courseIds.length === 0) return 0;

  // Get all quiz IDs for the instructor's courses
  const quizRows = db
    .select({ quizId: quizzes.id })
    .from(quizzes)
    .innerJoin(lessons, eq(quizzes.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(inArray(modules.courseId, courseIds))
    .all();

  const quizIds = quizRows.map((r) => r.quizId);
  if (quizIds.length === 0) return 0;

  // Get best attempt per student per quiz, then calculate pass rate
  const conditions = [inArray(quizAttempts.quizId, quizIds)];

  if (opts.dateRange?.from) {
    conditions.push(gte(quizAttempts.attemptedAt, opts.dateRange.from));
  }
  if (opts.dateRange?.to) {
    conditions.push(lte(quizAttempts.attemptedAt, opts.dateRange.to));
  }

  // Use a subquery approach: for each (userId, quizId), get max score, then check if passed
  // Simpler approach: get best attempt per student per quiz using GROUP BY with MAX score
  const result = db
    .select({
      total: sql<number>`count(*)`,
      passed: sql<number>`sum(case when max_passed = 1 then 1 else 0 end)`,
    })
    .from(
      db
        .select({
          userId: quizAttempts.userId,
          quizId: quizAttempts.quizId,
          max_passed: sql<number>`max(${quizAttempts.passed})`.as("max_passed"),
        })
        .from(quizAttempts)
        .where(and(...conditions))
        .groupBy(quizAttempts.userId, quizAttempts.quizId)
        .as("best_attempts")
    )
    .get();

  if (!result || result.total === 0) return 0;

  return Math.round((result.passed / result.total) * 100);
}

// ─── Phase 2: Trend, Per-Course, and Quiz Performance queries ───

export function determineGranularity(dateRange?: DateRange): Granularity {
  if (!dateRange?.from || !dateRange?.to) return "monthly";

  const from = new Date(dateRange.from);
  const to = new Date(dateRange.to);
  const diffDays = Math.ceil(
    (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays < 90) return "daily";
  if (diffDays < 365) return "weekly";
  return "monthly";
}

function getSqlDateTrunc(
  column: ReturnType<typeof sql>,
  granularity: Granularity
): ReturnType<typeof sql<string>> {
  switch (granularity) {
    case "daily":
      return sql<string>`date(${column})`;
    case "weekly":
      // SQLite: date(col, 'weekday 0', '-6 days') gives the Monday of the week
      return sql<string>`date(${column}, 'weekday 0', '-6 days')`;
    case "monthly":
      return sql<string>`strftime('%Y-%m-01', ${column})`;
  }
}

export function getRevenueTrend(opts: {
  instructorId: number;
  dateRange?: DateRange;
}): { data: TrendDataPoint[]; granularity: Granularity } {
  const courseIds = getCourseIdsForInstructor(opts.instructorId);
  if (courseIds.length === 0) return { data: [], granularity: "monthly" };

  const granularity = determineGranularity(opts.dateRange);
  const conditions = [inArray(purchases.courseId, courseIds)];

  if (opts.dateRange?.from) {
    conditions.push(gte(purchases.createdAt, opts.dateRange.from));
  }
  if (opts.dateRange?.to) {
    conditions.push(lte(purchases.createdAt, opts.dateRange.to));
  }

  const periodExpr = getSqlDateTrunc(
    sql`${purchases.createdAt}`,
    granularity
  );

  const rows = db
    .select({
      period: periodExpr.as("period"),
      value: sql<number>`coalesce(sum(${purchases.pricePaid}), 0)`.as("value"),
    })
    .from(purchases)
    .where(and(...conditions))
    .groupBy(sql`period`)
    .orderBy(sql`period`)
    .all();

  return { data: rows, granularity };
}

export function getEnrollmentTrend(opts: {
  instructorId: number;
  dateRange?: DateRange;
}): { data: TrendDataPoint[]; granularity: Granularity } {
  const courseIds = getCourseIdsForInstructor(opts.instructorId);
  if (courseIds.length === 0) return { data: [], granularity: "monthly" };

  const granularity = determineGranularity(opts.dateRange);
  const conditions = [inArray(enrollments.courseId, courseIds)];

  if (opts.dateRange?.from) {
    conditions.push(gte(enrollments.enrolledAt, opts.dateRange.from));
  }
  if (opts.dateRange?.to) {
    conditions.push(lte(enrollments.enrolledAt, opts.dateRange.to));
  }

  const periodExpr = getSqlDateTrunc(
    sql`${enrollments.enrolledAt}`,
    granularity
  );

  const rows = db
    .select({
      period: periodExpr.as("period"),
      value: sql<number>`count(*)`.as("value"),
    })
    .from(enrollments)
    .where(and(...conditions))
    .groupBy(sql`period`)
    .orderBy(sql`period`)
    .all();

  return { data: rows, granularity };
}

export function getPerCourseEnrollments(opts: {
  instructorId: number;
  dateRange?: DateRange;
}): CourseEnrollmentRow[] {
  const courseIds = getCourseIdsForInstructor(opts.instructorId);
  if (courseIds.length === 0) return [];

  const conditions = [inArray(enrollments.courseId, courseIds)];

  if (opts.dateRange?.from) {
    conditions.push(gte(enrollments.enrolledAt, opts.dateRange.from));
  }
  if (opts.dateRange?.to) {
    conditions.push(lte(enrollments.enrolledAt, opts.dateRange.to));
  }

  const rows = db
    .select({
      courseId: courses.id,
      courseTitle: courses.title,
      enrollmentCount: sql<number>`count(${enrollments.id})`.as(
        "enrollment_count"
      ),
    })
    .from(enrollments)
    .innerJoin(courses, eq(enrollments.courseId, courses.id))
    .where(and(...conditions))
    .groupBy(courses.id, courses.title)
    .orderBy(sql`enrollment_count desc`)
    .all();

  return rows;
}

export function getPerCourseCompletionRates(opts: {
  instructorId: number;
  dateRange?: DateRange;
}): CourseCompletionRow[] {
  const courseIds = getCourseIdsForInstructor(opts.instructorId);
  if (courseIds.length === 0) return [];

  const conditions = [inArray(enrollments.courseId, courseIds)];

  if (opts.dateRange?.from) {
    conditions.push(gte(enrollments.enrolledAt, opts.dateRange.from));
  }
  if (opts.dateRange?.to) {
    conditions.push(lte(enrollments.enrolledAt, opts.dateRange.to));
  }

  const rows = db
    .select({
      courseId: courses.id,
      courseTitle: courses.title,
      totalEnrolled: sql<number>`count(${enrollments.id})`.as("total_enrolled"),
      completedCount:
        sql<number>`sum(case when ${enrollments.completedAt} is not null then 1 else 0 end)`.as(
          "completed_count"
        ),
    })
    .from(enrollments)
    .innerJoin(courses, eq(enrollments.courseId, courses.id))
    .where(and(...conditions))
    .groupBy(courses.id, courses.title)
    .all();

  return rows.map((r) => ({
    ...r,
    completionRate:
      r.totalEnrolled > 0
        ? Math.round((r.completedCount / r.totalEnrolled) * 100)
        : 0,
  }));
}

export function getQuizPerformanceByCourse(opts: {
  instructorId: number;
  dateRange?: DateRange;
}): CourseQuizPerformanceRow[] {
  const courseIds = getCourseIdsForInstructor(opts.instructorId);
  if (courseIds.length === 0) return [];

  // Get all quizzes for the instructor's courses, grouped by course
  const quizRows = db
    .select({
      courseId: modules.courseId,
      courseTitle: courses.title,
      quizId: quizzes.id,
    })
    .from(quizzes)
    .innerJoin(lessons, eq(quizzes.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(inArray(modules.courseId, courseIds))
    .all();

  if (quizRows.length === 0) return [];

  // Group quizzes by course
  const courseQuizMap = new Map<
    number,
    { courseTitle: string; quizIds: number[] }
  >();
  for (const row of quizRows) {
    const existing = courseQuizMap.get(row.courseId);
    if (existing) {
      existing.quizIds.push(row.quizId);
    } else {
      courseQuizMap.set(row.courseId, {
        courseTitle: row.courseTitle,
        quizIds: [row.quizId],
      });
    }
  }

  const results: CourseQuizPerformanceRow[] = [];

  for (const [courseId, { courseTitle, quizIds }] of courseQuizMap) {
    const conditions = [inArray(quizAttempts.quizId, quizIds)];

    if (opts.dateRange?.from) {
      conditions.push(gte(quizAttempts.attemptedAt, opts.dateRange.from));
    }
    if (opts.dateRange?.to) {
      conditions.push(lte(quizAttempts.attemptedAt, opts.dateRange.to));
    }

    // Best attempt per student per quiz
    const row = db
      .select({
        total: sql<number>`count(*)`,
        passed: sql<number>`sum(case when max_passed = 1 then 1 else 0 end)`,
        avgScore: sql<number>`avg(max_score)`,
      })
      .from(
        db
          .select({
            userId: quizAttempts.userId,
            quizId: quizAttempts.quizId,
            max_passed: sql<number>`max(${quizAttempts.passed})`.as(
              "max_passed"
            ),
            max_score: sql<number>`max(${quizAttempts.score})`.as("max_score"),
          })
          .from(quizAttempts)
          .where(and(...conditions))
          .groupBy(quizAttempts.userId, quizAttempts.quizId)
          .as("best_attempts")
      )
      .get();

    if (row && row.total > 0) {
      results.push({
        courseId,
        courseTitle,
        quizCount: quizIds.length,
        averagePassRate: Math.round((row.passed / row.total) * 100),
        averageScore: Math.round(row.avgScore * 100),
      });
    } else {
      results.push({
        courseId,
        courseTitle,
        quizCount: quizIds.length,
        averagePassRate: 0,
        averageScore: 0,
      });
    }
  }

  return results;
}
