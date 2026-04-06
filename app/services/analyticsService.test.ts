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
  getTotalRevenue,
  getTotalEnrollments,
  getAverageCompletionRate,
  getAverageQuizPassRate,
} from "./analyticsService";

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

function createModuleAndLesson(courseId: number) {
  const mod = testDb
    .insert(schema.modules)
    .values({ courseId, title: "Module 1", position: 1 })
    .returning()
    .get();

  const lesson = testDb
    .insert(schema.lessons)
    .values({ moduleId: mod.id, title: "Lesson 1", position: 1 })
    .returning()
    .get();

  return { module: mod, lesson };
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
      const revenue = getTotalRevenue({ instructorId: base.instructor.id });
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

      const revenue = getTotalRevenue({ instructorId: base.instructor.id });
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

      const revenue = getTotalRevenue({ instructorId: base.instructor.id });
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

      const revenue = getTotalRevenue({
        instructorId: base.instructor.id,
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

      const revenue = getTotalRevenue({ instructorId: newInstructor.id });
      expect(revenue).toBe(0);
    });
  });

  // ─── getTotalEnrollments ───

  describe("getTotalEnrollments", () => {
    it("returns 0 when no enrollments exist", () => {
      const count = getTotalEnrollments({ instructorId: base.instructor.id });
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

      const count = getTotalEnrollments({ instructorId: base.instructor.id });
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

      const count = getTotalEnrollments({ instructorId: base.instructor.id });
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

      const count = getTotalEnrollments({
        instructorId: base.instructor.id,
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
      const rate = getAverageCompletionRate({ instructorId: base.instructor.id });
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
      const rate = getAverageCompletionRate({ instructorId: base.instructor.id });
      expect(rate).toBe(50);
    });

    it("returns 100 when all students completed", () => {
      const student = createStudent("S1", "s1@test.com");
      createEnrollment({
        userId: student.id,
        courseId: base.course.id,
        completedAt: "2025-02-01T00:00:00.000Z",
      });

      const rate = getAverageCompletionRate({ instructorId: base.instructor.id });
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
      const rate = getAverageCompletionRate({
        instructorId: base.instructor.id,
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
      const rate = getAverageQuizPassRate({ instructorId: base.instructor.id });
      expect(rate).toBe(0);
    });

    it("returns 0 when no attempts exist", () => {
      const { lesson } = createModuleAndLesson(base.course.id);
      createQuiz(lesson.id);

      const rate = getAverageQuizPassRate({ instructorId: base.instructor.id });
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
      const rate = getAverageQuizPassRate({ instructorId: base.instructor.id });
      expect(rate).toBe(50);
    });

    it("returns 100 when all best attempts pass", () => {
      const { lesson } = createModuleAndLesson(base.course.id);
      const quiz = createQuiz(lesson.id);
      const student = createStudent("S1", "s1@test.com");

      createQuizAttempt({ userId: student.id, quizId: quiz.id, score: 0.9, passed: true });

      const rate = getAverageQuizPassRate({ instructorId: base.instructor.id });
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
      const rate = getAverageQuizPassRate({
        instructorId: base.instructor.id,
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
      const rate = getAverageQuizPassRate({ instructorId: base.instructor.id });
      expect(rate).toBe(0);
    });
  });
});
