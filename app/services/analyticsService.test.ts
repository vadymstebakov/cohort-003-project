import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

import {
  getCourseIdsForInstructor,
  getTotalRevenue,
  getTotalEnrollments,
  getAverageCompletionRate,
  getAverageQuizPassRate,
  getRevenueTrend,
  getEnrollmentTrend,
  getPerCourseEnrollments,
  getPerCourseCompletionRates,
  getQuizPerformanceByCourse,
  determineGranularity,
  getLessonFunnel,
  getModuleFunnel,
  getStudentSegments,
  getDropOffAnalysis,
} from "./analyticsService";

function courseIdsFor(instructorId: number) {
  return getCourseIdsForInstructor(instructorId);
}

// ─── Helpers ───

function createStudent(name: string, email: string) {
  return testDb
    .insert(schema.users)
    .values({ name, email, role: schema.UserRole.Student })
    .returning()
    .get();
}

function createCourseForInstructor(opts: {
  instructorId: number;
  title: string;
  slug: string;
}) {
  return testDb
    .insert(schema.courses)
    .values({
      title: opts.title,
      slug: opts.slug,
      description: "Test",
      instructorId: opts.instructorId,
      categoryId: base.category.id,
      status: schema.CourseStatus.Published,
    })
    .returning()
    .get();
}

function createPurchase(opts: {
  userId: number;
  courseId: number;
  pricePaid: number;
  createdAt?: string;
}) {
  return testDb
    .insert(schema.purchases)
    .values({
      userId: opts.userId,
      courseId: opts.courseId,
      pricePaid: opts.pricePaid,
      country: "US",
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    })
    .returning()
    .get();
}

function createEnrollment(opts: {
  userId: number;
  courseId: number;
  enrolledAt?: string;
  completedAt?: string | null;
}) {
  return testDb
    .insert(schema.enrollments)
    .values({
      userId: opts.userId,
      courseId: opts.courseId,
      ...(opts.enrolledAt ? { enrolledAt: opts.enrolledAt } : {}),
      completedAt: opts.completedAt ?? null,
    })
    .returning()
    .get();
}

function createModule(opts: {
  courseId: number;
  title: string;
  position: number;
}) {
  return testDb
    .insert(schema.modules)
    .values(opts)
    .returning()
    .get();
}

function createLesson(opts: {
  moduleId: number;
  title: string;
  position: number;
}) {
  return testDb
    .insert(schema.lessons)
    .values(opts)
    .returning()
    .get();
}

function createModuleAndLesson(courseId: number) {
  const mod = createModule({ courseId, title: "Module 1", position: 1 });
  const lesson = createLesson({ moduleId: mod.id, title: "Lesson 1", position: 1 });
  return { module: mod, lesson };
}

function createLessonProgress(opts: {
  userId: number;
  lessonId: number;
  completedAt?: string | null;
}) {
  return testDb
    .insert(schema.lessonProgress)
    .values({
      userId: opts.userId,
      lessonId: opts.lessonId,
      status: opts.completedAt
        ? schema.LessonProgressStatus.Completed
        : schema.LessonProgressStatus.InProgress,
      completedAt: opts.completedAt ?? null,
    })
    .returning()
    .get();
}

function createQuiz(lessonId: number) {
  return testDb
    .insert(schema.quizzes)
    .values({ lessonId, title: "Quiz 1", passingScore: 0.7 })
    .returning()
    .get();
}

function createQuizAttempt(opts: {
  userId: number;
  quizId: number;
  score: number;
  passed: boolean;
  attemptedAt?: string;
}) {
  return testDb
    .insert(schema.quizAttempts)
    .values({
      userId: opts.userId,
      quizId: opts.quizId,
      score: opts.score,
      passed: opts.passed,
      ...(opts.attemptedAt ? { attemptedAt: opts.attemptedAt } : {}),
    })
    .returning()
    .get();
}

describe("analyticsService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  // ─── getTotalRevenue ───

  describe("getTotalRevenue", () => {
    it("returns 0 when no purchases exist", () => {
      const revenue = getTotalRevenue({ courseIds: courseIdsFor(base.instructor.id)});
      expect(revenue).toBe(0);
    });

    it("sums revenue across all instructor courses", () => {
      const student = createStudent("S1", "s1@test.com");
      const course2 = createCourseForInstructor({
        instructorId: base.instructor.id,
        title: "Course 2",
        slug: "course-2",
      });

      createPurchase({ userId: student.id, courseId: base.course.id, pricePaid: 5000 });
      createPurchase({ userId: student.id, courseId: course2.id, pricePaid: 3000 });

      const revenue = getTotalRevenue({ courseIds: courseIdsFor(base.instructor.id)});
      expect(revenue).toBe(8000);
    });

    it("does not include revenue from other instructors", () => {
      const otherInstructor = testDb
        .insert(schema.users)
        .values({ name: "Other", email: "other@test.com", role: schema.UserRole.Instructor })
        .returning()
        .get();

      const otherCourse = createCourseForInstructor({
        instructorId: otherInstructor.id,
        title: "Other Course",
        slug: "other-course",
      });

      const student = createStudent("S1", "s1@test.com");
      createPurchase({ userId: student.id, courseId: base.course.id, pricePaid: 5000 });
      createPurchase({ userId: student.id, courseId: otherCourse.id, pricePaid: 9000 });

      const revenue = getTotalRevenue({ courseIds: courseIdsFor(base.instructor.id)});
      expect(revenue).toBe(5000);
    });

    it("filters by date range", () => {
      const student = createStudent("S1", "s1@test.com");
      createPurchase({
        userId: student.id,
        courseId: base.course.id,
        pricePaid: 5000,
        createdAt: "2025-01-15T00:00:00.000Z",
      });
      createPurchase({
        userId: student.id,
        courseId: base.course.id,
        pricePaid: 3000,
        createdAt: "2025-03-15T00:00:00.000Z",
      });

      const revenue = getTotalRevenue({ courseIds: courseIdsFor(base.instructor.id),
        dateRange: {
          from: "2025-02-01T00:00:00.000Z",
          to: "2025-04-01T00:00:00.000Z",
        },
      });
      expect(revenue).toBe(3000);
    });

    it("returns 0 for instructor with no courses", () => {
      const newInstructor = testDb
        .insert(schema.users)
        .values({ name: "New", email: "new@test.com", role: schema.UserRole.Instructor })
        .returning()
        .get();

      const revenue = getTotalRevenue({ courseIds: courseIdsFor(newInstructor.id)});
      expect(revenue).toBe(0);
    });
  });

  // ─── getTotalEnrollments ───

  describe("getTotalEnrollments", () => {
    it("returns 0 when no enrollments exist", () => {
      const count = getTotalEnrollments({ courseIds: courseIdsFor(base.instructor.id)});
      expect(count).toBe(0);
    });

    it("counts enrollments across all instructor courses", () => {
      const s1 = createStudent("S1", "s1@test.com");
      const s2 = createStudent("S2", "s2@test.com");
      const course2 = createCourseForInstructor({
        instructorId: base.instructor.id,
        title: "Course 2",
        slug: "course-2",
      });

      createEnrollment({ userId: s1.id, courseId: base.course.id });
      createEnrollment({ userId: s2.id, courseId: base.course.id });
      createEnrollment({ userId: s1.id, courseId: course2.id });

      const count = getTotalEnrollments({ courseIds: courseIdsFor(base.instructor.id)});
      expect(count).toBe(3);
    });

    it("does not count enrollments from other instructors", () => {
      const otherInstructor = testDb
        .insert(schema.users)
        .values({ name: "Other", email: "other@test.com", role: schema.UserRole.Instructor })
        .returning()
        .get();

      const otherCourse = createCourseForInstructor({
        instructorId: otherInstructor.id,
        title: "Other",
        slug: "other",
      });

      const student = createStudent("S1", "s1@test.com");
      createEnrollment({ userId: student.id, courseId: base.course.id });
      createEnrollment({ userId: student.id, courseId: otherCourse.id });

      const count = getTotalEnrollments({ courseIds: courseIdsFor(base.instructor.id)});
      expect(count).toBe(1);
    });

    it("filters by date range", () => {
      const student = createStudent("S1", "s1@test.com");
      const s2 = createStudent("S2", "s2@test.com");

      createEnrollment({
        userId: student.id,
        courseId: base.course.id,
        enrolledAt: "2025-01-15T00:00:00.000Z",
      });
      createEnrollment({
        userId: s2.id,
        courseId: base.course.id,
        enrolledAt: "2025-03-15T00:00:00.000Z",
      });

      const count = getTotalEnrollments({ courseIds: courseIdsFor(base.instructor.id),
        dateRange: {
          from: "2025-02-01T00:00:00.000Z",
          to: "2025-04-01T00:00:00.000Z",
        },
      });
      expect(count).toBe(1);
    });
  });

  // ─── getAverageCompletionRate ───

  describe("getAverageCompletionRate", () => {
    it("returns 0 when no enrollments exist", () => {
      const rate = getAverageCompletionRate({ courseIds: courseIdsFor(base.instructor.id)});
      expect(rate).toBe(0);
    });

    it("calculates completion rate across courses", () => {
      const s1 = createStudent("S1", "s1@test.com");
      const s2 = createStudent("S2", "s2@test.com");
      const s3 = createStudent("S3", "s3@test.com");
      const s4 = createStudent("S4", "s4@test.com");

      createEnrollment({
        userId: s1.id,
        courseId: base.course.id,
        completedAt: "2025-02-01T00:00:00.000Z",
      });
      createEnrollment({
        userId: s2.id,
        courseId: base.course.id,
        completedAt: "2025-02-15T00:00:00.000Z",
      });
      createEnrollment({ userId: s3.id, courseId: base.course.id });
      createEnrollment({ userId: s4.id, courseId: base.course.id });

      // 2 completed out of 4 = 50%
      const rate = getAverageCompletionRate({ courseIds: courseIdsFor(base.instructor.id)});
      expect(rate).toBe(50);
    });

    it("returns 100 when all students completed", () => {
      const student = createStudent("S1", "s1@test.com");
      createEnrollment({
        userId: student.id,
        courseId: base.course.id,
        completedAt: "2025-02-01T00:00:00.000Z",
      });

      const rate = getAverageCompletionRate({ courseIds: courseIdsFor(base.instructor.id)});
      expect(rate).toBe(100);
    });

    it("filters by enrollment date range", () => {
      const s1 = createStudent("S1", "s1@test.com");
      const s2 = createStudent("S2", "s2@test.com");

      createEnrollment({
        userId: s1.id,
        courseId: base.course.id,
        enrolledAt: "2025-01-15T00:00:00.000Z",
        completedAt: "2025-02-01T00:00:00.000Z",
      });
      createEnrollment({
        userId: s2.id,
        courseId: base.course.id,
        enrolledAt: "2025-03-15T00:00:00.000Z",
      });

      // Only s2 in range, not completed
      const rate = getAverageCompletionRate({ courseIds: courseIdsFor(base.instructor.id),
        dateRange: {
          from: "2025-02-01T00:00:00.000Z",
          to: "2025-04-01T00:00:00.000Z",
        },
      });
      expect(rate).toBe(0);
    });
  });

  // ─── getAverageQuizPassRate ───

  describe("getAverageQuizPassRate", () => {
    it("returns 0 when no quizzes exist", () => {
      const rate = getAverageQuizPassRate({ courseIds: courseIdsFor(base.instructor.id)});
      expect(rate).toBe(0);
    });

    it("returns 0 when no attempts exist", () => {
      const { lesson } = createModuleAndLesson(base.course.id);
      createQuiz(lesson.id);

      const rate = getAverageQuizPassRate({ courseIds: courseIdsFor(base.instructor.id)});
      expect(rate).toBe(0);
    });

    it("calculates pass rate based on best attempt per student per quiz", () => {
      const { lesson } = createModuleAndLesson(base.course.id);
      const quiz = createQuiz(lesson.id);

      const s1 = createStudent("S1", "s1@test.com");
      const s2 = createStudent("S2", "s2@test.com");

      // S1: failed first, passed second (best = passed)
      createQuizAttempt({ userId: s1.id, quizId: quiz.id, score: 0.5, passed: false });
      createQuizAttempt({ userId: s1.id, quizId: quiz.id, score: 0.9, passed: true });

      // S2: only failed
      createQuizAttempt({ userId: s2.id, quizId: quiz.id, score: 0.3, passed: false });

      // 1 passed out of 2 students = 50%
      const rate = getAverageQuizPassRate({ courseIds: courseIdsFor(base.instructor.id)});
      expect(rate).toBe(50);
    });

    it("returns 100 when all best attempts pass", () => {
      const { lesson } = createModuleAndLesson(base.course.id);
      const quiz = createQuiz(lesson.id);
      const student = createStudent("S1", "s1@test.com");

      createQuizAttempt({ userId: student.id, quizId: quiz.id, score: 0.9, passed: true });

      const rate = getAverageQuizPassRate({ courseIds: courseIdsFor(base.instructor.id)});
      expect(rate).toBe(100);
    });

    it("filters by attempted date range", () => {
      const { lesson } = createModuleAndLesson(base.course.id);
      const quiz = createQuiz(lesson.id);

      const s1 = createStudent("S1", "s1@test.com");
      const s2 = createStudent("S2", "s2@test.com");

      createQuizAttempt({
        userId: s1.id,
        quizId: quiz.id,
        score: 0.9,
        passed: true,
        attemptedAt: "2025-01-15T00:00:00.000Z",
      });
      createQuizAttempt({
        userId: s2.id,
        quizId: quiz.id,
        score: 0.3,
        passed: false,
        attemptedAt: "2025-03-15T00:00:00.000Z",
      });

      // Only s2 in range, who failed
      const rate = getAverageQuizPassRate({ courseIds: courseIdsFor(base.instructor.id),
        dateRange: {
          from: "2025-02-01T00:00:00.000Z",
          to: "2025-04-01T00:00:00.000Z",
        },
      });
      expect(rate).toBe(0);
    });

    it("does not count quizzes from other instructors", () => {
      const otherInstructor = testDb
        .insert(schema.users)
        .values({ name: "Other", email: "other@test.com", role: schema.UserRole.Instructor })
        .returning()
        .get();

      const otherCourse = createCourseForInstructor({
        instructorId: otherInstructor.id,
        title: "Other",
        slug: "other",
      });

      const { lesson: otherLesson } = createModuleAndLesson(otherCourse.id);
      const otherQuiz = createQuiz(otherLesson.id);

      const student = createStudent("S1", "s1@test.com");
      createQuizAttempt({
        userId: student.id,
        quizId: otherQuiz.id,
        score: 0.9,
        passed: true,
      });

      // No quizzes for base instructor
      const rate = getAverageQuizPassRate({ courseIds: courseIdsFor(base.instructor.id)});
      expect(rate).toBe(0);
    });
  });

  // ─── determineGranularity ───

  describe("determineGranularity", () => {
    it("returns monthly when no date range provided", () => {
      expect(determineGranularity()).toBe("monthly");
      expect(determineGranularity({})).toBe("monthly");
    });

    it("returns daily for ranges under 90 days", () => {
      expect(
        determineGranularity({
          from: "2025-01-01T00:00:00.000Z",
          to: "2025-03-01T00:00:00.000Z",
        })
      ).toBe("daily");
    });

    it("returns weekly for ranges 90-365 days", () => {
      expect(
        determineGranularity({
          from: "2025-01-01T00:00:00.000Z",
          to: "2025-06-01T00:00:00.000Z",
        })
      ).toBe("weekly");
    });

    it("returns monthly for ranges over 365 days", () => {
      expect(
        determineGranularity({
          from: "2024-01-01T00:00:00.000Z",
          to: "2025-06-01T00:00:00.000Z",
        })
      ).toBe("monthly");
    });
  });

  // ─── getRevenueTrend ───

  describe("getRevenueTrend", () => {
    it("returns empty data when no purchases exist", () => {
      const result = getRevenueTrend({ courseIds: courseIdsFor(base.instructor.id)});
      expect(result.data).toEqual([]);
    });

    it("groups revenue by period", () => {
      const student = createStudent("S1", "s1@test.com");
      createPurchase({
        userId: student.id,
        courseId: base.course.id,
        pricePaid: 5000,
        createdAt: "2025-01-15T00:00:00.000Z",
      });
      createPurchase({
        userId: student.id,
        courseId: base.course.id,
        pricePaid: 3000,
        createdAt: "2025-01-20T00:00:00.000Z",
      });
      createPurchase({
        userId: student.id,
        courseId: base.course.id,
        pricePaid: 2000,
        createdAt: "2025-02-10T00:00:00.000Z",
      });

      const result = getRevenueTrend({ courseIds: courseIdsFor(base.instructor.id),
        dateRange: {
          from: "2025-01-01T00:00:00.000Z",
          to: "2025-03-01T00:00:00.000Z",
        },
      });

      // Daily granularity (< 90 days)
      expect(result.granularity).toBe("daily");
      expect(result.data.length).toBe(3);
      expect(result.data[0]).toEqual({ period: "2025-01-15", value: 5000 });
      expect(result.data[1]).toEqual({ period: "2025-01-20", value: 3000 });
      expect(result.data[2]).toEqual({ period: "2025-02-10", value: 2000 });
    });

    it("filters by date range", () => {
      const student = createStudent("S1", "s1@test.com");
      createPurchase({
        userId: student.id,
        courseId: base.course.id,
        pricePaid: 5000,
        createdAt: "2025-01-15T00:00:00.000Z",
      });
      createPurchase({
        userId: student.id,
        courseId: base.course.id,
        pricePaid: 3000,
        createdAt: "2025-03-15T00:00:00.000Z",
      });

      const result = getRevenueTrend({ courseIds: courseIdsFor(base.instructor.id),
        dateRange: {
          from: "2025-02-01T00:00:00.000Z",
          to: "2025-04-01T00:00:00.000Z",
        },
      });

      expect(result.data.length).toBe(1);
      expect(result.data[0].value).toBe(3000);
    });
  });

  // ─── getEnrollmentTrend ───

  describe("getEnrollmentTrend", () => {
    it("returns empty data when no enrollments exist", () => {
      const result = getEnrollmentTrend({ courseIds: courseIdsFor(base.instructor.id)});
      expect(result.data).toEqual([]);
    });

    it("groups enrollments by period", () => {
      const s1 = createStudent("S1", "s1@test.com");
      const s2 = createStudent("S2", "s2@test.com");
      const s3 = createStudent("S3", "s3@test.com");

      createEnrollment({
        userId: s1.id,
        courseId: base.course.id,
        enrolledAt: "2025-01-15T00:00:00.000Z",
      });
      createEnrollment({
        userId: s2.id,
        courseId: base.course.id,
        enrolledAt: "2025-01-15T00:00:00.000Z",
      });
      createEnrollment({
        userId: s3.id,
        courseId: base.course.id,
        enrolledAt: "2025-02-10T00:00:00.000Z",
      });

      const result = getEnrollmentTrend({ courseIds: courseIdsFor(base.instructor.id),
        dateRange: {
          from: "2025-01-01T00:00:00.000Z",
          to: "2025-03-01T00:00:00.000Z",
        },
      });

      expect(result.granularity).toBe("daily");
      expect(result.data.length).toBe(2);
      expect(result.data[0]).toEqual({ period: "2025-01-15", value: 2 });
      expect(result.data[1]).toEqual({ period: "2025-02-10", value: 1 });
    });
  });

  // ─── getPerCourseEnrollments ───

  describe("getPerCourseEnrollments", () => {
    it("returns empty array when no enrollments exist", () => {
      const result = getPerCourseEnrollments({ courseIds: courseIdsFor(base.instructor.id),
      });
      expect(result).toEqual([]);
    });

    it("returns per-course enrollment counts sorted descending", () => {
      const course2 = createCourseForInstructor({
        instructorId: base.instructor.id,
        title: "Course 2",
        slug: "course-2",
      });

      const s1 = createStudent("S1", "s1@test.com");
      const s2 = createStudent("S2", "s2@test.com");
      const s3 = createStudent("S3", "s3@test.com");

      createEnrollment({ userId: s1.id, courseId: base.course.id });
      createEnrollment({ userId: s2.id, courseId: course2.id });
      createEnrollment({ userId: s3.id, courseId: course2.id });

      const result = getPerCourseEnrollments({ courseIds: courseIdsFor(base.instructor.id),
      });

      expect(result.length).toBe(2);
      // Course 2 has more enrollments, should be first
      expect(result[0].courseTitle).toBe("Course 2");
      expect(result[0].enrollmentCount).toBe(2);
      expect(result[1].courseTitle).toBe(base.course.title);
      expect(result[1].enrollmentCount).toBe(1);
    });

    it("does not include other instructors courses", () => {
      const otherInstructor = testDb
        .insert(schema.users)
        .values({
          name: "Other",
          email: "other@test.com",
          role: schema.UserRole.Instructor,
        })
        .returning()
        .get();

      const otherCourse = createCourseForInstructor({
        instructorId: otherInstructor.id,
        title: "Other Course",
        slug: "other-course",
      });

      const student = createStudent("S1", "s1@test.com");
      createEnrollment({ userId: student.id, courseId: base.course.id });
      createEnrollment({ userId: student.id, courseId: otherCourse.id });

      const result = getPerCourseEnrollments({ courseIds: courseIdsFor(base.instructor.id),
      });

      expect(result.length).toBe(1);
      expect(result[0].courseTitle).toBe(base.course.title);
    });

    it("filters by date range", () => {
      const student = createStudent("S1", "s1@test.com");
      const s2 = createStudent("S2", "s2@test.com");

      createEnrollment({
        userId: student.id,
        courseId: base.course.id,
        enrolledAt: "2025-01-15T00:00:00.000Z",
      });
      createEnrollment({
        userId: s2.id,
        courseId: base.course.id,
        enrolledAt: "2025-03-15T00:00:00.000Z",
      });

      const result = getPerCourseEnrollments({ courseIds: courseIdsFor(base.instructor.id),
        dateRange: {
          from: "2025-02-01T00:00:00.000Z",
          to: "2025-04-01T00:00:00.000Z",
        },
      });

      expect(result.length).toBe(1);
      expect(result[0].enrollmentCount).toBe(1);
    });
  });

  // ─── getPerCourseCompletionRates ───

  describe("getPerCourseCompletionRates", () => {
    it("returns empty array when no enrollments exist", () => {
      const result = getPerCourseCompletionRates({ courseIds: courseIdsFor(base.instructor.id),
      });
      expect(result).toEqual([]);
    });

    it("calculates completion rate per course", () => {
      const course2 = createCourseForInstructor({
        instructorId: base.instructor.id,
        title: "Course 2",
        slug: "course-2",
      });

      const s1 = createStudent("S1", "s1@test.com");
      const s2 = createStudent("S2", "s2@test.com");
      const s3 = createStudent("S3", "s3@test.com");

      // Course 1: 1 of 2 completed = 50%
      createEnrollment({
        userId: s1.id,
        courseId: base.course.id,
        completedAt: "2025-02-01T00:00:00.000Z",
      });
      createEnrollment({ userId: s2.id, courseId: base.course.id });

      // Course 2: 1 of 1 completed = 100%
      createEnrollment({
        userId: s3.id,
        courseId: course2.id,
        completedAt: "2025-02-01T00:00:00.000Z",
      });

      const result = getPerCourseCompletionRates({ courseIds: courseIdsFor(base.instructor.id),
      });

      expect(result.length).toBe(2);

      const c1 = result.find((r) => r.courseId === base.course.id)!;
      expect(c1.totalEnrolled).toBe(2);
      expect(c1.completedCount).toBe(1);
      expect(c1.completionRate).toBe(50);

      const c2 = result.find((r) => r.courseId === course2.id)!;
      expect(c2.totalEnrolled).toBe(1);
      expect(c2.completedCount).toBe(1);
      expect(c2.completionRate).toBe(100);
    });

    it("filters by enrollment date range", () => {
      const s1 = createStudent("S1", "s1@test.com");
      const s2 = createStudent("S2", "s2@test.com");

      createEnrollment({
        userId: s1.id,
        courseId: base.course.id,
        enrolledAt: "2025-01-15T00:00:00.000Z",
        completedAt: "2025-02-01T00:00:00.000Z",
      });
      createEnrollment({
        userId: s2.id,
        courseId: base.course.id,
        enrolledAt: "2025-03-15T00:00:00.000Z",
      });

      const result = getPerCourseCompletionRates({ courseIds: courseIdsFor(base.instructor.id),
        dateRange: {
          from: "2025-02-01T00:00:00.000Z",
          to: "2025-04-01T00:00:00.000Z",
        },
      });

      // Only s2 in range, not completed
      expect(result.length).toBe(1);
      expect(result[0].completionRate).toBe(0);
    });
  });

  // ─── getQuizPerformanceByCourse ───

  describe("getQuizPerformanceByCourse", () => {
    it("returns empty array when no quizzes exist", () => {
      const result = getQuizPerformanceByCourse({ courseIds: courseIdsFor(base.instructor.id),
      });
      expect(result).toEqual([]);
    });

    it("returns quiz performance per course", () => {
      const { lesson } = createModuleAndLesson(base.course.id);
      const quiz1 = createQuiz(lesson.id);

      const s1 = createStudent("S1", "s1@test.com");
      const s2 = createStudent("S2", "s2@test.com");

      // S1: passed with score 0.9
      createQuizAttempt({
        userId: s1.id,
        quizId: quiz1.id,
        score: 0.9,
        passed: true,
      });

      // S2: failed with score 0.4
      createQuizAttempt({
        userId: s2.id,
        quizId: quiz1.id,
        score: 0.4,
        passed: false,
      });

      const result = getQuizPerformanceByCourse({ courseIds: courseIdsFor(base.instructor.id),
      });

      expect(result.length).toBe(1);
      expect(result[0].courseTitle).toBe(base.course.title);
      expect(result[0].quizCount).toBe(1);
      expect(result[0].averagePassRate).toBe(50);
      // avg of best scores: (0.9 + 0.4) / 2 = 0.65 -> 65%
      expect(result[0].averageScore).toBe(65);
    });

    it("uses best attempt per student per quiz", () => {
      const { lesson } = createModuleAndLesson(base.course.id);
      const quiz = createQuiz(lesson.id);

      const student = createStudent("S1", "s1@test.com");

      // Failed first, passed second
      createQuizAttempt({
        userId: student.id,
        quizId: quiz.id,
        score: 0.3,
        passed: false,
      });
      createQuizAttempt({
        userId: student.id,
        quizId: quiz.id,
        score: 0.85,
        passed: true,
      });

      const result = getQuizPerformanceByCourse({ courseIds: courseIdsFor(base.instructor.id),
      });

      expect(result[0].averagePassRate).toBe(100);
      expect(result[0].averageScore).toBe(85);
    });

    it("returns 0 pass rate when quizzes exist but no attempts", () => {
      const { lesson } = createModuleAndLesson(base.course.id);
      createQuiz(lesson.id);

      const result = getQuizPerformanceByCourse({ courseIds: courseIdsFor(base.instructor.id),
      });

      expect(result.length).toBe(1);
      expect(result[0].averagePassRate).toBe(0);
      expect(result[0].averageScore).toBe(0);
    });

    it("filters by attempted date range", () => {
      const { lesson } = createModuleAndLesson(base.course.id);
      const quiz = createQuiz(lesson.id);

      const s1 = createStudent("S1", "s1@test.com");
      const s2 = createStudent("S2", "s2@test.com");

      createQuizAttempt({
        userId: s1.id,
        quizId: quiz.id,
        score: 0.9,
        passed: true,
        attemptedAt: "2025-01-15T00:00:00.000Z",
      });
      createQuizAttempt({
        userId: s2.id,
        quizId: quiz.id,
        score: 0.3,
        passed: false,
        attemptedAt: "2025-03-15T00:00:00.000Z",
      });

      const result = getQuizPerformanceByCourse({ courseIds: courseIdsFor(base.instructor.id),
        dateRange: {
          from: "2025-02-01T00:00:00.000Z",
          to: "2025-04-01T00:00:00.000Z",
        },
      });

      // Only s2 in range, who failed
      expect(result[0].averagePassRate).toBe(0);
    });
  });

  // ─── getLessonFunnel ───

  describe("getLessonFunnel", () => {
    it("returns empty array when no enrollments exist", () => {
      const result = getLessonFunnel({ courseId: base.course.id });
      expect(result).toEqual([]);
    });

    it("returns lesson completion percentages in order", () => {
      const mod = createModule({ courseId: base.course.id, title: "M1", position: 1 });
      const l1 = createLesson({ moduleId: mod.id, title: "L1", position: 1 });
      const l2 = createLesson({ moduleId: mod.id, title: "L2", position: 2 });
      const l3 = createLesson({ moduleId: mod.id, title: "L3", position: 3 });

      const s1 = createStudent("S1", "s1@test.com");
      const s2 = createStudent("S2", "s2@test.com");

      createEnrollment({ userId: s1.id, courseId: base.course.id });
      createEnrollment({ userId: s2.id, courseId: base.course.id });

      // Both complete L1, only s1 completes L2, nobody completes L3
      createLessonProgress({ userId: s1.id, lessonId: l1.id, completedAt: "2025-01-10T00:00:00.000Z" });
      createLessonProgress({ userId: s2.id, lessonId: l1.id, completedAt: "2025-01-11T00:00:00.000Z" });
      createLessonProgress({ userId: s1.id, lessonId: l2.id, completedAt: "2025-01-12T00:00:00.000Z" });

      const result = getLessonFunnel({ courseId: base.course.id });

      expect(result.length).toBe(3);
      expect(result[0].lessonTitle).toBe("L1");
      expect(result[0].completionPercent).toBe(100); // 2/2
      expect(result[1].lessonTitle).toBe("L2");
      expect(result[1].completionPercent).toBe(50); // 1/2
      expect(result[2].lessonTitle).toBe("L3");
      expect(result[2].completionPercent).toBe(0); // 0/2
    });

    it("orders lessons by module position then lesson position", () => {
      const m1 = createModule({ courseId: base.course.id, title: "M1", position: 1 });
      const m2 = createModule({ courseId: base.course.id, title: "M2", position: 2 });
      const l1 = createLesson({ moduleId: m1.id, title: "M1-L1", position: 1 });
      const l2 = createLesson({ moduleId: m2.id, title: "M2-L1", position: 1 });

      const student = createStudent("S1", "s1@test.com");
      createEnrollment({ userId: student.id, courseId: base.course.id });

      const result = getLessonFunnel({ courseId: base.course.id });

      expect(result[0].lessonTitle).toBe("M1-L1");
      expect(result[0].modulePosition).toBe(1);
      expect(result[1].lessonTitle).toBe("M2-L1");
      expect(result[1].modulePosition).toBe(2);
    });

    it("scopes to enrollments within date range", () => {
      const mod = createModule({ courseId: base.course.id, title: "M1", position: 1 });
      const l1 = createLesson({ moduleId: mod.id, title: "L1", position: 1 });

      const s1 = createStudent("S1", "s1@test.com");
      const s2 = createStudent("S2", "s2@test.com");

      createEnrollment({ userId: s1.id, courseId: base.course.id, enrolledAt: "2025-01-01T00:00:00.000Z" });
      createEnrollment({ userId: s2.id, courseId: base.course.id, enrolledAt: "2025-03-01T00:00:00.000Z" });

      createLessonProgress({ userId: s1.id, lessonId: l1.id, completedAt: "2025-01-10T00:00:00.000Z" });
      createLessonProgress({ userId: s2.id, lessonId: l1.id, completedAt: "2025-03-10T00:00:00.000Z" });

      const result = getLessonFunnel({
        courseId: base.course.id,
        dateRange: { from: "2025-02-01T00:00:00.000Z", to: "2025-04-01T00:00:00.000Z" },
      });

      // Only s2 enrolled in range, and s2 completed L1
      expect(result.length).toBe(1);
      expect(result[0].completionPercent).toBe(100);
      expect(result[0].completedCount).toBe(1);
    });
  });

  // ─── getModuleFunnel ───

  describe("getModuleFunnel", () => {
    it("returns empty array when no enrollments exist", () => {
      const result = getModuleFunnel({ courseId: base.course.id });
      expect(result).toEqual([]);
    });

    it("returns module completion percentages", () => {
      const m1 = createModule({ courseId: base.course.id, title: "M1", position: 1 });
      const l1 = createLesson({ moduleId: m1.id, title: "L1", position: 1 });
      const l2 = createLesson({ moduleId: m1.id, title: "L2", position: 2 });

      const m2 = createModule({ courseId: base.course.id, title: "M2", position: 2 });
      const l3 = createLesson({ moduleId: m2.id, title: "L3", position: 1 });

      const s1 = createStudent("S1", "s1@test.com");
      const s2 = createStudent("S2", "s2@test.com");

      createEnrollment({ userId: s1.id, courseId: base.course.id });
      createEnrollment({ userId: s2.id, courseId: base.course.id });

      // S1 completes all of M1 (L1 + L2) and M2 (L3)
      createLessonProgress({ userId: s1.id, lessonId: l1.id, completedAt: "2025-01-10T00:00:00.000Z" });
      createLessonProgress({ userId: s1.id, lessonId: l2.id, completedAt: "2025-01-11T00:00:00.000Z" });
      createLessonProgress({ userId: s1.id, lessonId: l3.id, completedAt: "2025-01-12T00:00:00.000Z" });

      // S2 completes only L1 of M1 (not all of M1)
      createLessonProgress({ userId: s2.id, lessonId: l1.id, completedAt: "2025-01-10T00:00:00.000Z" });

      const result = getModuleFunnel({ courseId: base.course.id });

      expect(result.length).toBe(2);
      // M1: only s1 completed all lessons (L1+L2) → 50%
      expect(result[0].moduleTitle).toBe("M1");
      expect(result[0].completionPercent).toBe(50);
      expect(result[0].lessonCount).toBe(2);
      // M2: only s1 completed all lessons (L3) → 50%
      expect(result[1].moduleTitle).toBe("M2");
      expect(result[1].completionPercent).toBe(50);
    });

    it("returns 0 for modules with no lessons", () => {
      createModule({ courseId: base.course.id, title: "Empty", position: 1 });

      const student = createStudent("S1", "s1@test.com");
      createEnrollment({ userId: student.id, courseId: base.course.id });

      const result = getModuleFunnel({ courseId: base.course.id });

      expect(result.length).toBe(1);
      expect(result[0].completionPercent).toBe(0);
      expect(result[0].lessonCount).toBe(0);
    });
  });

  // ─── getStudentSegments ───

  describe("getStudentSegments", () => {
    const now = "2025-03-01T00:00:00.000Z";

    it("returns all zeros when no enrollments exist", () => {
      const result = getStudentSegments({ courseId: base.course.id, now });
      expect(result).toEqual({
        neverStarted: 0,
        inProgress: 0,
        abandoned: 0,
        completed: 0,
        total: 0,
      });
    });

    it("classifies completed students", () => {
      const student = createStudent("S1", "s1@test.com");
      createEnrollment({
        userId: student.id,
        courseId: base.course.id,
        completedAt: "2025-02-01T00:00:00.000Z",
      });

      const result = getStudentSegments({ courseId: base.course.id, now });
      expect(result.completed).toBe(1);
      expect(result.total).toBe(1);
    });

    it("classifies never-started students", () => {
      const student = createStudent("S1", "s1@test.com");
      createEnrollment({ userId: student.id, courseId: base.course.id });

      const result = getStudentSegments({ courseId: base.course.id, now });
      expect(result.neverStarted).toBe(1);
    });

    it("classifies in-progress students (enrolled recently)", () => {
      const mod = createModule({ courseId: base.course.id, title: "M1", position: 1 });
      const l1 = createLesson({ moduleId: mod.id, title: "L1", position: 1 });

      const student = createStudent("S1", "s1@test.com");
      // Enrolled 5 days ago (< 14 days)
      createEnrollment({
        userId: student.id,
        courseId: base.course.id,
        enrolledAt: "2025-02-24T00:00:00.000Z",
      });
      createLessonProgress({
        userId: student.id,
        lessonId: l1.id,
        completedAt: "2025-02-25T00:00:00.000Z",
      });

      const result = getStudentSegments({ courseId: base.course.id, now });
      expect(result.inProgress).toBe(1);
    });

    it("classifies in-progress students (active recently)", () => {
      const mod = createModule({ courseId: base.course.id, title: "M1", position: 1 });
      const l1 = createLesson({ moduleId: mod.id, title: "L1", position: 1 });

      const student = createStudent("S1", "s1@test.com");
      // Enrolled > 14 days ago, but had activity within 14 days
      createEnrollment({
        userId: student.id,
        courseId: base.course.id,
        enrolledAt: "2025-01-01T00:00:00.000Z",
      });
      createLessonProgress({
        userId: student.id,
        lessonId: l1.id,
        completedAt: "2025-02-20T00:00:00.000Z", // 9 days ago, < 14 days
      });

      const result = getStudentSegments({ courseId: base.course.id, now });
      expect(result.inProgress).toBe(1);
    });

    it("classifies abandoned students", () => {
      const mod = createModule({ courseId: base.course.id, title: "M1", position: 1 });
      const l1 = createLesson({ moduleId: mod.id, title: "L1", position: 1 });

      const student = createStudent("S1", "s1@test.com");
      // Enrolled > 14 days ago, last activity > 14 days ago
      createEnrollment({
        userId: student.id,
        courseId: base.course.id,
        enrolledAt: "2025-01-01T00:00:00.000Z",
      });
      createLessonProgress({
        userId: student.id,
        lessonId: l1.id,
        completedAt: "2025-01-10T00:00:00.000Z", // 50 days ago, > 14 days
      });

      const result = getStudentSegments({ courseId: base.course.id, now });
      expect(result.abandoned).toBe(1);
    });

    it("correctly segments a mixed group of students", () => {
      const mod = createModule({ courseId: base.course.id, title: "M1", position: 1 });
      const l1 = createLesson({ moduleId: mod.id, title: "L1", position: 1 });

      const s1 = createStudent("S1", "s1@test.com"); // completed
      const s2 = createStudent("S2", "s2@test.com"); // never started
      const s3 = createStudent("S3", "s3@test.com"); // in progress (recent enrollment)
      const s4 = createStudent("S4", "s4@test.com"); // abandoned

      createEnrollment({
        userId: s1.id,
        courseId: base.course.id,
        completedAt: "2025-02-01T00:00:00.000Z",
      });
      createEnrollment({ userId: s2.id, courseId: base.course.id });
      createEnrollment({
        userId: s3.id,
        courseId: base.course.id,
        enrolledAt: "2025-02-25T00:00:00.000Z",
      });
      createLessonProgress({
        userId: s3.id,
        lessonId: l1.id,
        completedAt: "2025-02-26T00:00:00.000Z",
      });
      createEnrollment({
        userId: s4.id,
        courseId: base.course.id,
        enrolledAt: "2025-01-01T00:00:00.000Z",
      });
      createLessonProgress({
        userId: s4.id,
        lessonId: l1.id,
        completedAt: "2025-01-05T00:00:00.000Z",
      });

      const result = getStudentSegments({ courseId: base.course.id, now });
      expect(result.completed).toBe(1);
      expect(result.neverStarted).toBe(1);
      expect(result.inProgress).toBe(1);
      expect(result.abandoned).toBe(1);
      expect(result.total).toBe(4);
    });
  });

  // ─── getDropOffAnalysis ───

  describe("getDropOffAnalysis", () => {
    const now = "2025-03-01T00:00:00.000Z";

    it("returns empty array when no courses exist", () => {
      const newInstructor = testDb
        .insert(schema.users)
        .values({ name: "New", email: "new@test.com", role: schema.UserRole.Instructor })
        .returning()
        .get();

      const result = getDropOffAnalysis({ courseIds: courseIdsFor(newInstructor.id), now });
      expect(result).toEqual([]);
    });

    it("returns drop-off data for each course", () => {
      const mod = createModule({ courseId: base.course.id, title: "M1", position: 1 });
      const l1 = createLesson({ moduleId: mod.id, title: "L1", position: 1 });

      const s1 = createStudent("S1", "s1@test.com");
      const s2 = createStudent("S2", "s2@test.com");

      createEnrollment({
        userId: s1.id,
        courseId: base.course.id,
        completedAt: "2025-02-01T00:00:00.000Z",
      });
      createEnrollment({
        userId: s2.id,
        courseId: base.course.id,
        enrolledAt: "2025-01-01T00:00:00.000Z",
      });
      createLessonProgress({
        userId: s1.id,
        lessonId: l1.id,
        completedAt: "2025-01-15T00:00:00.000Z",
      });
      createLessonProgress({
        userId: s2.id,
        lessonId: l1.id,
        completedAt: "2025-01-10T00:00:00.000Z",
      });

      const result = getDropOffAnalysis({ courseIds: courseIdsFor(base.instructor.id),
        now,
      });

      expect(result.length).toBe(1);
      expect(result[0].courseTitle).toBe(base.course.title);
      expect(result[0].lessonFunnel.length).toBe(1);
      expect(result[0].moduleFunnel.length).toBe(1);
      expect(result[0].segments.total).toBe(2);
      // s1 completed, s2 started but abandoned (enrolled > 14 days, last activity > 14 days)
      // 2 started, 1 completed → drop-off = (2-1)/2 = 50%
      expect(result[0].dropOffRate).toBe(50);
    });

    it("calculates 0 drop-off when no students started", () => {
      const student = createStudent("S1", "s1@test.com");
      createEnrollment({ userId: student.id, courseId: base.course.id });

      const result = getDropOffAnalysis({ courseIds: courseIdsFor(base.instructor.id),
        now,
      });

      // No one started, drop-off rate = 0
      expect(result[0].dropOffRate).toBe(0);
    });
  });
});
