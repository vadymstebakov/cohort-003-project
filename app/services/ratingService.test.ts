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

// Import after mock
import {
  upsertRating,
  getUserRating,
  getCourseRatingStats,
  getCourseRatingStatsMap,
} from "./ratingService";

describe("ratingService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  // ─── upsertRating ───

  describe("upsertRating", () => {
    it("creates a new rating when none exists", () => {
      const result = upsertRating({ userId: base.user.id, courseId: base.course.id, rating: 4 });

      expect(result).toBeDefined();
      expect(result.userId).toBe(base.user.id);
      expect(result.courseId).toBe(base.course.id);
      expect(result.rating).toBe(4);
    });

    it("updates an existing rating instead of creating a duplicate", () => {
      upsertRating({ userId: base.user.id, courseId: base.course.id, rating: 3 });
      const updated = upsertRating({ userId: base.user.id, courseId: base.course.id, rating: 5 });

      expect(updated.rating).toBe(5);

      // Verify only one row exists
      const all = testDb
        .select()
        .from(schema.courseRatings)
        .all();
      expect(all).toHaveLength(1);
    });

    it("sets updatedAt when updating an existing rating", () => {
      const original = upsertRating({ userId: base.user.id, courseId: base.course.id, rating: 2 });
      const originalUpdatedAt = original.updatedAt;

      // Manually set createdAt to an older timestamp so updatedAt will differ
      testDb
        .update(schema.courseRatings)
        .set({ updatedAt: "2020-01-01T00:00:00.000Z" })
        .run();

      const updated = upsertRating({ userId: base.user.id, courseId: base.course.id, rating: 4 });

      expect(updated.updatedAt).toBeDefined();
      expect(updated.updatedAt).not.toBe("2020-01-01T00:00:00.000Z");
    });
  });

  // ─── getUserRating ───

  describe("getUserRating", () => {
    it("returns the rating when it exists", () => {
      upsertRating({ userId: base.user.id, courseId: base.course.id, rating: 4 });

      const result = getUserRating({ userId: base.user.id, courseId: base.course.id });

      expect(result).toBeDefined();
      expect(result!.rating).toBe(4);
      expect(result!.userId).toBe(base.user.id);
      expect(result!.courseId).toBe(base.course.id);
    });

    it("returns undefined when no rating exists", () => {
      const result = getUserRating({ userId: base.user.id, courseId: base.course.id });

      expect(result).toBeUndefined();
    });

    it("does not return ratings from other users", () => {
      const otherUser = testDb
        .insert(schema.users)
        .values({
          name: "Other User",
          email: "other@example.com",
          role: schema.UserRole.Student,
        })
        .returning()
        .get();

      upsertRating({ userId: otherUser.id, courseId: base.course.id, rating: 5 });

      const result = getUserRating({ userId: base.user.id, courseId: base.course.id });
      expect(result).toBeUndefined();
    });
  });

  // ─── getCourseRatingStats ───

  describe("getCourseRatingStats", () => {
    it("returns average and count for rated course", () => {
      const user2 = testDb
        .insert(schema.users)
        .values({
          name: "User Two",
          email: "user2@example.com",
          role: schema.UserRole.Student,
        })
        .returning()
        .get();

      upsertRating({ userId: base.user.id, courseId: base.course.id, rating: 3 });
      upsertRating({ userId: user2.id, courseId: base.course.id, rating: 5 });

      const stats = getCourseRatingStats(base.course.id);

      expect(stats.averageRating).toBe(4);
      expect(stats.ratingCount).toBe(2);
    });

    it("returns zeros when course has no ratings", () => {
      const stats = getCourseRatingStats(base.course.id);

      expect(stats.averageRating).toBe(0);
      expect(stats.ratingCount).toBe(0);
    });

    it("returns correct stats for a single rating", () => {
      upsertRating({ userId: base.user.id, courseId: base.course.id, rating: 5 });

      const stats = getCourseRatingStats(base.course.id);

      expect(stats.averageRating).toBe(5);
      expect(stats.ratingCount).toBe(1);
    });
  });

  // ─── getCourseRatingStatsMap ───

  describe("getCourseRatingStatsMap", () => {
    it("returns empty map for empty input array", () => {
      const map = getCourseRatingStatsMap([]);

      expect(map).toBeInstanceOf(Map);
      expect(map.size).toBe(0);
    });

    it("returns stats map for a single course", () => {
      upsertRating({ userId: base.user.id, courseId: base.course.id, rating: 4 });

      const map = getCourseRatingStatsMap([base.course.id]);

      expect(map.size).toBe(1);
      const stats = map.get(base.course.id);
      expect(stats).toBeDefined();
      expect(stats!.averageRating).toBe(4);
      expect(stats!.ratingCount).toBe(1);
    });

    it("returns stats for multiple courses", () => {
      const course2 = testDb
        .insert(schema.courses)
        .values({
          title: "Second Course",
          slug: "second-course",
          description: "Another course",
          instructorId: base.instructor.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Published,
        })
        .returning()
        .get();

      const user2 = testDb
        .insert(schema.users)
        .values({
          name: "User Two",
          email: "user2@example.com",
          role: schema.UserRole.Student,
        })
        .returning()
        .get();

      upsertRating({ userId: base.user.id, courseId: base.course.id, rating: 3 });
      upsertRating({ userId: user2.id, courseId: base.course.id, rating: 5 });
      upsertRating({ userId: base.user.id, courseId: course2.id, rating: 2 });

      const map = getCourseRatingStatsMap([base.course.id, course2.id]);

      expect(map.size).toBe(2);

      const stats1 = map.get(base.course.id);
      expect(stats1!.averageRating).toBe(4);
      expect(stats1!.ratingCount).toBe(2);

      const stats2 = map.get(course2.id);
      expect(stats2!.averageRating).toBe(2);
      expect(stats2!.ratingCount).toBe(1);
    });

    it("omits courses with no ratings from the map", () => {
      const course2 = testDb
        .insert(schema.courses)
        .values({
          title: "Unrated Course",
          slug: "unrated-course",
          description: "No ratings here",
          instructorId: base.instructor.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Published,
        })
        .returning()
        .get();

      upsertRating({ userId: base.user.id, courseId: base.course.id, rating: 5 });

      const map = getCourseRatingStatsMap([base.course.id, course2.id]);

      expect(map.has(base.course.id)).toBe(true);
      expect(map.has(course2.id)).toBe(false);
    });
  });
});
