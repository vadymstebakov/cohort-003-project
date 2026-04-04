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
  toggleBookmark,
  isLessonBookmarked,
  getBookmarkedLessonIds,
} from "./bookmarkService";

function createModuleAndLesson(testDb: ReturnType<typeof createTestDb>, courseId: number) {
  const mod = testDb
    .insert(schema.modules)
    .values({
      title: "Module 1",
      courseId,
      position: 1,
    })
    .returning()
    .get();

  const lesson = testDb
    .insert(schema.lessons)
    .values({
      title: "Lesson 1",
      moduleId: mod.id,
      position: 1,
    })
    .returning()
    .get();

  return { mod, lesson };
}

describe("bookmarkService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("toggleBookmark", () => {
    it("creates a bookmark when none exists", () => {
      const { lesson } = createModuleAndLesson(testDb, base.course.id);

      const result = toggleBookmark({ userId: base.user.id, lessonId: lesson.id });

      expect(result.bookmarked).toBe(true);
    });

    it("removes a bookmark when one exists", () => {
      const { lesson } = createModuleAndLesson(testDb, base.course.id);

      toggleBookmark({ userId: base.user.id, lessonId: lesson.id });
      const result = toggleBookmark({ userId: base.user.id, lessonId: lesson.id });

      expect(result.bookmarked).toBe(false);
    });

    it("re-creates a bookmark after removal", () => {
      const { lesson } = createModuleAndLesson(testDb, base.course.id);

      toggleBookmark({ userId: base.user.id, lessonId: lesson.id });
      toggleBookmark({ userId: base.user.id, lessonId: lesson.id });
      const result = toggleBookmark({ userId: base.user.id, lessonId: lesson.id });

      expect(result.bookmarked).toBe(true);
    });
  });

  describe("isLessonBookmarked", () => {
    it("returns false when no bookmark exists", () => {
      const { lesson } = createModuleAndLesson(testDb, base.course.id);

      expect(isLessonBookmarked({ userId: base.user.id, lessonId: lesson.id })).toBe(false);
    });

    it("returns true when bookmark exists", () => {
      const { lesson } = createModuleAndLesson(testDb, base.course.id);
      toggleBookmark({ userId: base.user.id, lessonId: lesson.id });

      expect(isLessonBookmarked({ userId: base.user.id, lessonId: lesson.id })).toBe(true);
    });

    it("returns false after bookmark is toggled off", () => {
      const { lesson } = createModuleAndLesson(testDb, base.course.id);
      toggleBookmark({ userId: base.user.id, lessonId: lesson.id });
      toggleBookmark({ userId: base.user.id, lessonId: lesson.id });

      expect(isLessonBookmarked({ userId: base.user.id, lessonId: lesson.id })).toBe(false);
    });
  });

  describe("getBookmarkedLessonIds", () => {
    it("returns empty array when no bookmarks exist", () => {
      const ids = getBookmarkedLessonIds({ userId: base.user.id, courseId: base.course.id });

      expect(ids).toEqual([]);
    });

    it("returns bookmarked lesson ids for a course", () => {
      const { lesson } = createModuleAndLesson(testDb, base.course.id);
      toggleBookmark({ userId: base.user.id, lessonId: lesson.id });

      const ids = getBookmarkedLessonIds({ userId: base.user.id, courseId: base.course.id });

      expect(ids).toEqual([lesson.id]);
    });

    it("does not return bookmarks from other courses", () => {
      const otherCourse = testDb
        .insert(schema.courses)
        .values({
          title: "Other Course",
          slug: "other-course",
          description: "Another course",
          instructorId: base.instructor.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Published,
        })
        .returning()
        .get();

      const { lesson: otherLesson } = createModuleAndLesson(testDb, otherCourse.id);
      toggleBookmark({ userId: base.user.id, lessonId: otherLesson.id });

      const ids = getBookmarkedLessonIds({ userId: base.user.id, courseId: base.course.id });

      expect(ids).toEqual([]);
    });

    it("does not return bookmarks from other users", () => {
      const otherUser = testDb
        .insert(schema.users)
        .values({
          name: "Other User",
          email: "other@example.com",
          role: schema.UserRole.Student,
        })
        .returning()
        .get();

      const { lesson } = createModuleAndLesson(testDb, base.course.id);
      toggleBookmark({ userId: otherUser.id, lessonId: lesson.id });

      const ids = getBookmarkedLessonIds({ userId: base.user.id, courseId: base.course.id });

      expect(ids).toEqual([]);
    });

    it("returns multiple bookmarked lessons", () => {
      const mod = testDb
        .insert(schema.modules)
        .values({ title: "Module", courseId: base.course.id, position: 1 })
        .returning()
        .get();

      const lesson1 = testDb
        .insert(schema.lessons)
        .values({ title: "Lesson 1", moduleId: mod.id, position: 1 })
        .returning()
        .get();

      const lesson2 = testDb
        .insert(schema.lessons)
        .values({ title: "Lesson 2", moduleId: mod.id, position: 2 })
        .returning()
        .get();

      toggleBookmark({ userId: base.user.id, lessonId: lesson1.id });
      toggleBookmark({ userId: base.user.id, lessonId: lesson2.id });

      const ids = getBookmarkedLessonIds({ userId: base.user.id, courseId: base.course.id });

      expect(ids).toHaveLength(2);
      expect(ids).toContain(lesson1.id);
      expect(ids).toContain(lesson2.id);
    });
  });
});
