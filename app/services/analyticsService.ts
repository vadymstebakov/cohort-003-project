import { eq, and, sql, gte, lte, inArray } from "drizzle-orm";
import { db } from "~/db";
import {
  courses,
  enrollments,
  purchases,
  quizzes,
  quizAttempts,
  lessons,
  lessonProgress,
  modules,
} from "~/db/schema";

// ─── Analytics Service ───
// Aggregated analytics queries for the instructor dashboard.
// All date boundaries are passed as parameters (no internal Date.now()).
// Uses SQL-level aggregation for performance.
// All functions accept courseIds directly to avoid redundant lookups.

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

export function getCourseIdsForInstructor(instructorId: number): number[] {
  const rows = db
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.instructorId, instructorId))
    .all();

  return rows.map((r) => r.id);
}

interface ServiceOpts {
  courseIds: number[];
  dateRange?: DateRange;
}

export function getTotalRevenue(opts: ServiceOpts): number {
  if (opts.courseIds.length === 0) return 0;

  const conditions = [inArray(purchases.courseId, opts.courseIds)];

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

export function getTotalEnrollments(opts: ServiceOpts): number {
  if (opts.courseIds.length === 0) return 0;

  const conditions = [inArray(enrollments.courseId, opts.courseIds)];

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

export function getAverageCompletionRate(opts: ServiceOpts): number {
  if (opts.courseIds.length === 0) return 0;

  const conditions = [inArray(enrollments.courseId, opts.courseIds)];

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

export function getAverageQuizPassRate(opts: ServiceOpts): number {
  if (opts.courseIds.length === 0) return 0;

  // Get all quiz IDs for the instructor's courses
  const quizRows = db
    .select({ quizId: quizzes.id })
    .from(quizzes)
    .innerJoin(lessons, eq(quizzes.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(inArray(modules.courseId, opts.courseIds))
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

export function getRevenueTrend(opts: ServiceOpts): {
  data: TrendDataPoint[];
  granularity: Granularity;
} {
  if (opts.courseIds.length === 0) return { data: [], granularity: "monthly" };

  const granularity = determineGranularity(opts.dateRange);
  const conditions = [inArray(purchases.courseId, opts.courseIds)];

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

export function getEnrollmentTrend(opts: ServiceOpts): {
  data: TrendDataPoint[];
  granularity: Granularity;
} {
  if (opts.courseIds.length === 0) return { data: [], granularity: "monthly" };

  const granularity = determineGranularity(opts.dateRange);
  const conditions = [inArray(enrollments.courseId, opts.courseIds)];

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

export function getPerCourseEnrollments(opts: ServiceOpts): CourseEnrollmentRow[] {
  if (opts.courseIds.length === 0) return [];

  const conditions = [inArray(enrollments.courseId, opts.courseIds)];

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

export function getPerCourseCompletionRates(opts: ServiceOpts): CourseCompletionRow[] {
  if (opts.courseIds.length === 0) return [];

  const conditions = [inArray(enrollments.courseId, opts.courseIds)];

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

// ─── Quiz Performance (single query, no N+1) ───

export function getQuizPerformanceByCourse(opts: ServiceOpts): CourseQuizPerformanceRow[] {
  if (opts.courseIds.length === 0) return [];

  // Get all quizzes for the instructor's courses with course info
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
    .where(inArray(modules.courseId, opts.courseIds))
    .all();

  if (quizRows.length === 0) return [];

  // Group quizzes by course to get quiz counts
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

  // Single query: best attempt per student per quiz, aggregated by course
  const allQuizIds = quizRows.map((r) => r.quizId);
  const attemptConditions = [inArray(quizAttempts.quizId, allQuizIds)];

  if (opts.dateRange?.from) {
    attemptConditions.push(gte(quizAttempts.attemptedAt, opts.dateRange.from));
  }
  if (opts.dateRange?.to) {
    attemptConditions.push(lte(quizAttempts.attemptedAt, opts.dateRange.to));
  }

  // Build a quizId->courseId lookup using SQL via a CTE-like approach
  // We join best_attempts with the quiz->course chain to aggregate by course
  const bestAttempts = db
    .select({
      quizId: quizAttempts.quizId,
      maxPassed: sql<number>`max(${quizAttempts.passed})`.as("max_passed"),
      maxScore: sql<number>`max(${quizAttempts.score})`.as("max_score"),
    })
    .from(quizAttempts)
    .where(and(...attemptConditions))
    .groupBy(quizAttempts.userId, quizAttempts.quizId)
    .as("best_attempts");

  const courseStats = db
    .select({
      courseId: modules.courseId,
      total: sql<number>`count(*)`.as("total"),
      passed: sql<number>`sum(case when ${bestAttempts.maxPassed} = 1 then 1 else 0 end)`.as("passed"),
      avgScore: sql<number>`avg(${bestAttempts.maxScore})`.as("avg_score"),
    })
    .from(bestAttempts)
    .innerJoin(quizzes, eq(bestAttempts.quizId, quizzes.id))
    .innerJoin(lessons, eq(quizzes.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .groupBy(modules.courseId)
    .all();

  const statsMap = new Map(courseStats.map((r) => [r.courseId, r]));

  const results: CourseQuizPerformanceRow[] = [];
  for (const [courseId, { courseTitle, quizIds }] of courseQuizMap) {
    const stats = statsMap.get(courseId);
    if (stats && stats.total > 0) {
      results.push({
        courseId,
        courseTitle,
        quizCount: quizIds.length,
        averagePassRate: Math.round((stats.passed / stats.total) * 100),
        averageScore: Math.round(stats.avgScore * 100),
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

// ─── Phase 3: Drop-off Analysis types ───

export interface LessonFunnelRow {
  lessonId: number;
  lessonTitle: string;
  position: number;
  modulePosition: number;
  completedCount: number;
  completionPercent: number;
}

export interface ModuleFunnelRow {
  moduleId: number;
  moduleTitle: string;
  position: number;
  lessonCount: number;
  completedCount: number;
  completionPercent: number;
}

export type StudentSegment =
  | "never_started"
  | "in_progress"
  | "abandoned"
  | "completed";

export interface StudentSegmentCounts {
  neverStarted: number;
  inProgress: number;
  abandoned: number;
  completed: number;
  total: number;
}

export interface CourseDropOffData {
  courseId: number;
  courseTitle: string;
  lessonFunnel: LessonFunnelRow[];
  moduleFunnel: ModuleFunnelRow[];
  segments: StudentSegmentCounts;
  dropOffRate: number;
}

// ─── Phase 3: Drop-off Analysis queries ───

export function getLessonFunnel(opts: {
  courseId: number;
  dateRange?: DateRange;
}): LessonFunnelRow[] {
  // Get total enrolled students for this course
  const enrollmentConditions = [eq(enrollments.courseId, opts.courseId)];
  if (opts.dateRange?.from) {
    enrollmentConditions.push(gte(enrollments.enrolledAt, opts.dateRange.from));
  }
  if (opts.dateRange?.to) {
    enrollmentConditions.push(lte(enrollments.enrolledAt, opts.dateRange.to));
  }

  const enrolledResult = db
    .select({ count: sql<number>`count(*)` })
    .from(enrollments)
    .where(and(...enrollmentConditions))
    .get();

  const totalEnrolled = enrolledResult?.count ?? 0;
  if (totalEnrolled === 0) return [];

  // Get all lessons for this course ordered by module position, then lesson position
  const lessonRows = db
    .select({
      lessonId: lessons.id,
      lessonTitle: lessons.title,
      position: lessons.position,
      modulePosition: modules.position,
    })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, opts.courseId))
    .orderBy(modules.position, lessons.position)
    .all();

  if (lessonRows.length === 0) return [];

  // Use a subquery for enrolled user IDs instead of materializing the array
  const enrolledUsersSq = db
    .select({ userId: enrollments.userId })
    .from(enrollments)
    .where(and(...enrollmentConditions))
    .as("enrolled_users");

  // Count completions per lesson among enrolled students in a single query
  const lessonIds = lessonRows.map((r) => r.lessonId);

  const completionRows = db
    .select({
      lessonId: lessonProgress.lessonId,
      completedCount: sql<number>`count(distinct ${lessonProgress.userId})`.as(
        "completed_count"
      ),
    })
    .from(lessonProgress)
    .innerJoin(enrolledUsersSq, eq(lessonProgress.userId, enrolledUsersSq.userId))
    .where(
      and(
        inArray(lessonProgress.lessonId, lessonIds),
        sql`${lessonProgress.completedAt} is not null`
      )
    )
    .groupBy(lessonProgress.lessonId)
    .all();

  const completionMap = new Map(
    completionRows.map((r) => [r.lessonId, r.completedCount])
  );

  return lessonRows.map((row) => {
    const completedCount = completionMap.get(row.lessonId) ?? 0;
    return {
      lessonId: row.lessonId,
      lessonTitle: row.lessonTitle,
      position: row.position,
      modulePosition: row.modulePosition,
      completedCount,
      completionPercent:
        totalEnrolled > 0
          ? Math.round((completedCount / totalEnrolled) * 100)
          : 0,
    };
  });
}

export function getModuleFunnel(opts: {
  courseId: number;
  dateRange?: DateRange;
}): ModuleFunnelRow[] {
  // Get total enrolled students for this course
  const enrollmentConditions = [eq(enrollments.courseId, opts.courseId)];
  if (opts.dateRange?.from) {
    enrollmentConditions.push(gte(enrollments.enrolledAt, opts.dateRange.from));
  }
  if (opts.dateRange?.to) {
    enrollmentConditions.push(lte(enrollments.enrolledAt, opts.dateRange.to));
  }

  const enrolledResult = db
    .select({ count: sql<number>`count(*)` })
    .from(enrollments)
    .where(and(...enrollmentConditions))
    .get();

  const totalEnrolled = enrolledResult?.count ?? 0;
  if (totalEnrolled === 0) return [];

  // Get modules for this course
  const moduleRows = db
    .select({
      moduleId: modules.id,
      moduleTitle: modules.title,
      position: modules.position,
    })
    .from(modules)
    .where(eq(modules.courseId, opts.courseId))
    .orderBy(modules.position)
    .all();

  if (moduleRows.length === 0) return [];

  // Batch: get lesson counts per module in a single query
  const moduleIds = moduleRows.map((m) => m.moduleId);

  const lessonCountRows = db
    .select({
      moduleId: lessons.moduleId,
      lessonCount: sql<number>`count(*)`.as("lesson_count"),
    })
    .from(lessons)
    .where(inArray(lessons.moduleId, moduleIds))
    .groupBy(lessons.moduleId)
    .all();

  const lessonCountMap = new Map(
    lessonCountRows.map((r) => [r.moduleId, r.lessonCount])
  );

  // Batch: for each module, count students who completed ALL lessons
  // Uses a subquery for enrolled users
  const enrolledUsersSq = db
    .select({ userId: enrollments.userId })
    .from(enrollments)
    .where(and(...enrollmentConditions))
    .as("enrolled_users");

  // Single query: count completed lessons per user per module, then filter for full completion
  const allLessonRows = db
    .select({
      lessonId: lessons.id,
      moduleId: lessons.moduleId,
    })
    .from(lessons)
    .where(inArray(lessons.moduleId, moduleIds))
    .all();

  const allLessonIds = allLessonRows.map((l) => l.lessonId);

  if (allLessonIds.length === 0) {
    return moduleRows.map((mod) => ({
      moduleId: mod.moduleId,
      moduleTitle: mod.moduleTitle,
      position: mod.position,
      lessonCount: 0,
      completedCount: 0,
      completionPercent: 0,
    }));
  }

  // Get per-user, per-module completed lesson counts in a single query
  const userModuleProgress = db
    .select({
      userId: lessonProgress.userId,
      moduleId: lessons.moduleId,
      completedLessons: sql<number>`count(distinct ${lessonProgress.lessonId})`.as("completed_lessons"),
    })
    .from(lessonProgress)
    .innerJoin(lessons, eq(lessonProgress.lessonId, lessons.id))
    .innerJoin(enrolledUsersSq, eq(lessonProgress.userId, enrolledUsersSq.userId))
    .where(
      and(
        inArray(lessonProgress.lessonId, allLessonIds),
        sql`${lessonProgress.completedAt} is not null`
      )
    )
    .groupBy(lessonProgress.userId, lessons.moduleId)
    .all();

  // Count students who completed all lessons per module
  const moduleCompletionMap = new Map<number, number>();
  for (const row of userModuleProgress) {
    const requiredCount = lessonCountMap.get(row.moduleId) ?? 0;
    if (requiredCount > 0 && row.completedLessons >= requiredCount) {
      moduleCompletionMap.set(
        row.moduleId,
        (moduleCompletionMap.get(row.moduleId) ?? 0) + 1
      );
    }
  }

  return moduleRows.map((mod) => {
    const lessonCount = lessonCountMap.get(mod.moduleId) ?? 0;
    const completedCount = moduleCompletionMap.get(mod.moduleId) ?? 0;

    return {
      moduleId: mod.moduleId,
      moduleTitle: mod.moduleTitle,
      position: mod.position,
      lessonCount,
      completedCount,
      completionPercent:
        totalEnrolled > 0
          ? Math.round((completedCount / totalEnrolled) * 100)
          : 0,
    };
  });
}

export function getStudentSegments(opts: {
  courseId: number;
  now: string;
  dateRange?: DateRange;
}): StudentSegmentCounts {
  const enrollmentConditions = [eq(enrollments.courseId, opts.courseId)];
  if (opts.dateRange?.from) {
    enrollmentConditions.push(gte(enrollments.enrolledAt, opts.dateRange.from));
  }
  if (opts.dateRange?.to) {
    enrollmentConditions.push(lte(enrollments.enrolledAt, opts.dateRange.to));
  }

  // Get all enrolled students with their enrollment info
  const enrolledStudents = db
    .select({
      userId: enrollments.userId,
      enrolledAt: enrollments.enrolledAt,
      completedAt: enrollments.completedAt,
    })
    .from(enrollments)
    .where(and(...enrollmentConditions))
    .all();

  if (enrolledStudents.length === 0) {
    return { neverStarted: 0, inProgress: 0, abandoned: 0, completed: 0, total: 0 };
  }

  // Get all lessons for this course
  const courseLessons = db
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, opts.courseId))
    .all();

  const lessonIds = courseLessons.map((l) => l.id);

  // Get lesson completion counts and last activity per user
  const userIds = enrolledStudents.map((s) => s.userId);

  const progressRows =
    lessonIds.length > 0
      ? db
          .select({
            userId: lessonProgress.userId,
            completedCount:
              sql<number>`count(distinct case when ${lessonProgress.completedAt} is not null then ${lessonProgress.lessonId} end)`.as(
                "completed_count"
              ),
            lastActivity:
              sql<string>`max(${lessonProgress.completedAt})`.as(
                "last_activity"
              ),
          })
          .from(lessonProgress)
          .where(
            and(
              inArray(lessonProgress.userId, userIds),
              inArray(lessonProgress.lessonId, lessonIds)
            )
          )
          .groupBy(lessonProgress.userId)
          .all()
      : [];

  const progressMap = new Map(progressRows.map((r) => [r.userId, r]));

  const nowDate = new Date(opts.now);
  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;

  let neverStarted = 0;
  let inProgress = 0;
  let abandoned = 0;
  let completed = 0;

  for (const student of enrolledStudents) {
    // Completed: enrollment has completedAt set
    if (student.completedAt) {
      completed++;
      continue;
    }

    const progress = progressMap.get(student.userId);
    const completedLessons = progress?.completedCount ?? 0;

    // Never started: zero lesson completions
    if (completedLessons === 0) {
      neverStarted++;
      continue;
    }

    // Has started but not completed the course
    const enrolledDate = new Date(student.enrolledAt);
    const enrolledMoreThan14Days =
      nowDate.getTime() - enrolledDate.getTime() > fourteenDaysMs;

    const lastActivity = progress?.lastActivity
      ? new Date(progress.lastActivity)
      : null;
    const noRecentActivity = lastActivity
      ? nowDate.getTime() - lastActivity.getTime() > fourteenDaysMs
      : true;

    // Abandoned: started, < 100% progress, no activity 14+ days, enrolled 14+ days ago
    if (enrolledMoreThan14Days && noRecentActivity) {
      abandoned++;
    } else {
      // In progress: started, enrolled < 14 days ago OR active in last 14 days
      inProgress++;
    }
  }

  return {
    neverStarted,
    inProgress,
    abandoned,
    completed,
    total: enrolledStudents.length,
  };
}

export function getDropOffAnalysis(opts: {
  courseIds: number[];
  now: string;
  dateRange?: DateRange;
}): CourseDropOffData[] {
  if (opts.courseIds.length === 0) return [];

  // Get course titles
  const courseRows = db
    .select({ id: courses.id, title: courses.title })
    .from(courses)
    .where(inArray(courses.id, opts.courseIds))
    .all();

  return courseRows.map((course) => {
    const courseOpts = { courseId: course.id, dateRange: opts.dateRange };
    const lessonFunnel = getLessonFunnel(courseOpts);
    const moduleFunnel = getModuleFunnel(courseOpts);
    const segments = getStudentSegments({
      ...courseOpts,
      now: opts.now,
    });

    // Drop-off rate: percentage of students who started but didn't complete
    // (abandoned + in progress) / (total - never started), or 0 if none started
    const started = segments.total - segments.neverStarted;
    const dropOffRate =
      started > 0
        ? Math.round(((started - segments.completed) / started) * 100)
        : 0;

    return {
      courseId: course.id,
      courseTitle: course.title,
      lessonFunnel,
      moduleFunnel,
      segments,
      dropOffRate,
    };
  });
}
