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

interface DateRange {
  from?: string;
  to?: string;
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
