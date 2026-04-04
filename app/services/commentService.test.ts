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
  createComment,
  getCommentsByLesson,
  getCommentById,
  updateComment,
  deleteComment,
} from "./commentService";

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

describe("commentService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("createComment", () => {
    it("creates a comment and returns it", () => {
      const { lesson } = createModuleAndLesson(testDb, base.course.id);

      const comment = createComment({ userId: base.user.id, lessonId: lesson.id, content: "Great lesson!" });

      expect(comment).toBeDefined();
      expect(comment.id).toBeDefined();
      expect(comment.userId).toBe(base.user.id);
      expect(comment.lessonId).toBe(lesson.id);
      expect(comment.content).toBe("Great lesson!");
      expect(comment.createdAt).toBeDefined();
      expect(comment.updatedAt).toBeDefined();
    });

    it("creates multiple comments on the same lesson", () => {
      const { lesson } = createModuleAndLesson(testDb, base.course.id);

      const comment1 = createComment({ userId: base.user.id, lessonId: lesson.id, content: "First comment" });
      const comment2 = createComment({ userId: base.user.id, lessonId: lesson.id, content: "Second comment" });

      expect(comment1.id).not.toBe(comment2.id);
      expect(comment1.content).toBe("First comment");
      expect(comment2.content).toBe("Second comment");
    });
  });

  describe("getCommentsByLesson", () => {
    it("returns comments with user info", () => {
      const { lesson } = createModuleAndLesson(testDb, base.course.id);
      createComment({ userId: base.user.id, lessonId: lesson.id, content: "Hello world" });

      const comments = getCommentsByLesson(lesson.id);

      expect(comments).toHaveLength(1);
      expect(comments[0].content).toBe("Hello world");
      expect(comments[0].userId).toBe(base.user.id);
      expect(comments[0].userName).toBe("Test User");
      expect(comments[0].userAvatarUrl).toBeDefined();
      expect(comments[0].createdAt).toBeDefined();
      expect(comments[0].updatedAt).toBeDefined();
    });

    it("returns empty array when no comments exist", () => {
      const { lesson } = createModuleAndLesson(testDb, base.course.id);

      const comments = getCommentsByLesson(lesson.id);

      expect(comments).toEqual([]);
    });

    it("returns only comments for the specified lesson", () => {
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

      createComment({ userId: base.user.id, lessonId: lesson1.id, content: "Comment on lesson 1" });
      createComment({ userId: base.user.id, lessonId: lesson2.id, content: "Comment on lesson 2" });

      const comments = getCommentsByLesson(lesson1.id);

      expect(comments).toHaveLength(1);
      expect(comments[0].content).toBe("Comment on lesson 1");
    });

    it("returns comments from multiple users", () => {
      const { lesson } = createModuleAndLesson(testDb, base.course.id);

      createComment({ userId: base.user.id, lessonId: lesson.id, content: "Student comment" });
      createComment({ userId: base.instructor.id, lessonId: lesson.id, content: "Instructor comment" });

      const comments = getCommentsByLesson(lesson.id);

      expect(comments).toHaveLength(2);
    });
  });

  describe("getCommentById", () => {
    it("returns the comment when it exists", () => {
      const { lesson } = createModuleAndLesson(testDb, base.course.id);
      const created = createComment({ userId: base.user.id, lessonId: lesson.id, content: "Find me" });

      const comment = getCommentById(created.id);

      expect(comment).toBeDefined();
      expect(comment!.id).toBe(created.id);
      expect(comment!.content).toBe("Find me");
    });

    it("returns undefined when comment does not exist", () => {
      const comment = getCommentById(999);

      expect(comment).toBeUndefined();
    });
  });

  describe("updateComment", () => {
    it("updates the content", () => {
      const { lesson } = createModuleAndLesson(testDb, base.course.id);
      const created = createComment({ userId: base.user.id, lessonId: lesson.id, content: "Original" });

      const updated = updateComment(created.id, "Edited");

      expect(updated.id).toBe(created.id);
      expect(updated.content).toBe("Edited");
    });

    it("updates the updatedAt timestamp", () => {
      vi.useFakeTimers();
      const { lesson } = createModuleAndLesson(testDb, base.course.id);
      const created = createComment({ userId: base.user.id, lessonId: lesson.id, content: "Original" });

      vi.advanceTimersByTime(1000);
      const updated = updateComment(created.id, "Edited");

      expect(updated.updatedAt).not.toBe(created.updatedAt);
      vi.useRealTimers();
    });
  });

  describe("deleteComment", () => {
    it("deletes and returns the deleted comment", () => {
      const { lesson } = createModuleAndLesson(testDb, base.course.id);
      const created = createComment({ userId: base.user.id, lessonId: lesson.id, content: "Delete me" });

      const deleted = deleteComment(created.id);

      expect(deleted).toBeDefined();
      expect(deleted!.id).toBe(created.id);
      expect(deleted!.content).toBe("Delete me");
    });

    it("comment no longer exists after deletion", () => {
      const { lesson } = createModuleAndLesson(testDb, base.course.id);
      const created = createComment({ userId: base.user.id, lessonId: lesson.id, content: "Delete me" });

      deleteComment(created.id);

      const result = getCommentById(created.id);
      expect(result).toBeUndefined();
    });
  });
});
