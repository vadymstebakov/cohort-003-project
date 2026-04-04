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
  logWatchEvent,
  getWatchEvents,
  getLastWatchPosition,
  getWatchEventCount,
  getMaxWatchPosition,
  calculateWatchProgress,
  hasUserWatchedVideo,
  hasUserCompletedVideo,
  getUserWatchHistory,
  deleteWatchEvents,
} from "./videoTrackingService";

let mod: { id: number };
let lesson: { id: number };

describe("videoTrackingService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);

    mod = testDb
      .insert(schema.modules)
      .values({ title: "Module 1", courseId: base.course.id, position: 1 })
      .returning()
      .get();

    lesson = testDb
      .insert(schema.lessons)
      .values({ title: "Lesson 1", moduleId: mod.id, position: 1 })
      .returning()
      .get();
  });

  // ─── logWatchEvent ───

  describe("logWatchEvent", () => {
    it("should insert a watch event and return it", () => {
      const event = logWatchEvent({ userId: base.user.id, lessonId: lesson.id, eventType: "play", positionSeconds: 0 });

      expect(event).toBeDefined();
      expect(event.id).toBeDefined();
      expect(event.userId).toBe(base.user.id);
      expect(event.lessonId).toBe(lesson.id);
      expect(event.eventType).toBe("play");
      expect(event.positionSeconds).toBe(0);
      expect(event.createdAt).toBeDefined();
    });

    it("should insert multiple events for the same user and lesson", () => {
      logWatchEvent({ userId: base.user.id, lessonId: lesson.id, eventType: "play", positionSeconds: 0 });
      logWatchEvent({ userId: base.user.id, lessonId: lesson.id, eventType: "pause", positionSeconds: 30 });
      logWatchEvent({ userId: base.user.id, lessonId: lesson.id, eventType: "play", positionSeconds: 30 });

      const events = getWatchEvents({ userId: base.user.id, lessonId: lesson.id });
      expect(events).toHaveLength(3);
    });
  });

  // ─── getWatchEvents ───

  describe("getWatchEvents", () => {
    it("should return an empty array when no events exist", () => {
      const events = getWatchEvents({ userId: base.user.id, lessonId: lesson.id });
      expect(events).toEqual([]);
    });

    it("should return all events for a user and lesson ordered by createdAt", () => {
      logWatchEvent({ userId: base.user.id, lessonId: lesson.id, eventType: "play", positionSeconds: 0 });
      logWatchEvent({ userId: base.user.id, lessonId: lesson.id, eventType: "pause", positionSeconds: 15 });
      logWatchEvent({ userId: base.user.id, lessonId: lesson.id, eventType: "seek", positionSeconds: 45 });

      const events = getWatchEvents({ userId: base.user.id, lessonId: lesson.id });
      expect(events).toHaveLength(3);
      expect(events[0].eventType).toBe("play");
      expect(events[1].eventType).toBe("pause");
      expect(events[2].eventType).toBe("seek");
    });

    it("should not return events from a different user", () => {
      logWatchEvent({ userId: base.user.id, lessonId: lesson.id, eventType: "play", positionSeconds: 0 });
      logWatchEvent({ userId: base.instructor.id, lessonId: lesson.id, eventType: "play", positionSeconds: 10 });

      const events = getWatchEvents({ userId: base.user.id, lessonId: lesson.id });
      expect(events).toHaveLength(1);
      expect(events[0].userId).toBe(base.user.id);
    });

    it("should not return events from a different lesson", () => {
      const lesson2 = testDb
        .insert(schema.lessons)
        .values({ title: "Lesson 2", moduleId: mod.id, position: 2 })
        .returning()
        .get();

      logWatchEvent({ userId: base.user.id, lessonId: lesson.id, eventType: "play", positionSeconds: 0 });
      logWatchEvent({ userId: base.user.id, lessonId: lesson2.id, eventType: "play", positionSeconds: 20 });

      const events = getWatchEvents({ userId: base.user.id, lessonId: lesson.id });
      expect(events).toHaveLength(1);
      expect(events[0].lessonId).toBe(lesson.id);
    });
  });

  // ─── getLastWatchPosition ───

  describe("getLastWatchPosition", () => {
    it("should return 0 when no events exist", () => {
      const position = getLastWatchPosition({ userId: base.user.id, lessonId: lesson.id });
      expect(position).toBe(0);
    });

    it("should return the position of the most recent event", () => {
      // Insert events with explicit distinct timestamps so ordering is deterministic
      testDb
        .insert(schema.videoWatchEvents)
        .values({
          userId: base.user.id,
          lessonId: lesson.id,
          eventType: "play",
          positionSeconds: 0,
          createdAt: "2025-01-01T00:00:00.000Z",
        })
        .run();
      testDb
        .insert(schema.videoWatchEvents)
        .values({
          userId: base.user.id,
          lessonId: lesson.id,
          eventType: "pause",
          positionSeconds: 50,
          createdAt: "2025-01-01T00:01:00.000Z",
        })
        .run();
      testDb
        .insert(schema.videoWatchEvents)
        .values({
          userId: base.user.id,
          lessonId: lesson.id,
          eventType: "play",
          positionSeconds: 25,
          createdAt: "2025-01-01T00:02:00.000Z",
        })
        .run();

      const position = getLastWatchPosition({ userId: base.user.id, lessonId: lesson.id });
      expect(position).toBe(25);
    });
  });

  // ─── getWatchEventCount ───

  describe("getWatchEventCount", () => {
    it("should return 0 when no events exist", () => {
      const count = getWatchEventCount({ userId: base.user.id, lessonId: lesson.id });
      expect(count).toBe(0);
    });

    it("should return the correct count of events", () => {
      logWatchEvent({ userId: base.user.id, lessonId: lesson.id, eventType: "play", positionSeconds: 0 });
      logWatchEvent({ userId: base.user.id, lessonId: lesson.id, eventType: "pause", positionSeconds: 30 });
      logWatchEvent({ userId: base.user.id, lessonId: lesson.id, eventType: "seek", positionSeconds: 60 });

      const count = getWatchEventCount({ userId: base.user.id, lessonId: lesson.id });
      expect(count).toBe(3);
    });

    it("should not count events from other users", () => {
      logWatchEvent({ userId: base.user.id, lessonId: lesson.id, eventType: "play", positionSeconds: 0 });
      logWatchEvent({ userId: base.instructor.id, lessonId: lesson.id, eventType: "play", positionSeconds: 10 });

      const count = getWatchEventCount({ userId: base.user.id, lessonId: lesson.id });
      expect(count).toBe(1);
    });
  });

  // ─── getMaxWatchPosition ───

  describe("getMaxWatchPosition", () => {
    it("should return 0 when no events exist", () => {
      const maxPos = getMaxWatchPosition({ userId: base.user.id, lessonId: lesson.id });
      expect(maxPos).toBe(0);
    });

    it("should return the maximum position across all events", () => {
      logWatchEvent({ userId: base.user.id, lessonId: lesson.id, eventType: "play", positionSeconds: 0 });
      logWatchEvent({ userId: base.user.id, lessonId: lesson.id, eventType: "pause", positionSeconds: 120 });
      logWatchEvent({ userId: base.user.id, lessonId: lesson.id, eventType: "play", positionSeconds: 60 });

      const maxPos = getMaxWatchPosition({ userId: base.user.id, lessonId: lesson.id });
      expect(maxPos).toBe(120);
    });
  });

  // ─── calculateWatchProgress ───

  describe("calculateWatchProgress", () => {
    it("should return 0 when duration is 0", () => {
      const progress = calculateWatchProgress({ userId: base.user.id, lessonId: lesson.id, videoDurationSeconds: 0 });
      expect(progress).toBe(0);
    });

    it("should return 0 when duration is negative", () => {
      const progress = calculateWatchProgress({ userId: base.user.id, lessonId: lesson.id, videoDurationSeconds: -10 });
      expect(progress).toBe(0);
    });

    it("should return 0 when no events exist", () => {
      const progress = calculateWatchProgress({ userId: base.user.id, lessonId: lesson.id, videoDurationSeconds: 300 });
      expect(progress).toBe(0);
    });

    it("should calculate correct percentage based on max position", () => {
      logWatchEvent({ userId: base.user.id, lessonId: lesson.id, eventType: "play", positionSeconds: 0 });
      logWatchEvent({ userId: base.user.id, lessonId: lesson.id, eventType: "pause", positionSeconds: 150 });

      const progress = calculateWatchProgress({ userId: base.user.id, lessonId: lesson.id, videoDurationSeconds: 300 });
      expect(progress).toBe(50);
    });

    it("should cap progress at 100 when max position exceeds duration", () => {
      logWatchEvent({ userId: base.user.id, lessonId: lesson.id, eventType: "play", positionSeconds: 350 });

      const progress = calculateWatchProgress({ userId: base.user.id, lessonId: lesson.id, videoDurationSeconds: 300 });
      expect(progress).toBe(100);
    });

    it("should round the progress to the nearest integer", () => {
      logWatchEvent({ userId: base.user.id, lessonId: lesson.id, eventType: "pause", positionSeconds: 1 });

      // 1 / 3 * 100 = 33.33... -> rounds to 33
      const progress = calculateWatchProgress({ userId: base.user.id, lessonId: lesson.id, videoDurationSeconds: 3 });
      expect(progress).toBe(33);
    });
  });

  // ─── hasUserWatchedVideo ───

  describe("hasUserWatchedVideo", () => {
    it("should return false when no events exist", () => {
      expect(hasUserWatchedVideo({ userId: base.user.id, lessonId: lesson.id })).toBe(false);
    });

    it("should return true when at least one event exists", () => {
      logWatchEvent({ userId: base.user.id, lessonId: lesson.id, eventType: "play", positionSeconds: 0 });
      expect(hasUserWatchedVideo({ userId: base.user.id, lessonId: lesson.id })).toBe(true);
    });
  });

  // ─── hasUserCompletedVideo ───

  describe("hasUserCompletedVideo", () => {
    it("should return false when no events exist", () => {
      expect(hasUserCompletedVideo({ userId: base.user.id, lessonId: lesson.id, videoDurationSeconds: 300, completionThreshold: 90 })).toBe(
        false
      );
    });

    it("should return false when progress is below threshold", () => {
      logWatchEvent({ userId: base.user.id, lessonId: lesson.id, eventType: "pause", positionSeconds: 100 });

      // progress = 100/300 * 100 = 33%
      expect(hasUserCompletedVideo({ userId: base.user.id, lessonId: lesson.id, videoDurationSeconds: 300, completionThreshold: 90 })).toBe(
        false
      );
    });

    it("should return true when progress meets the threshold", () => {
      logWatchEvent({ userId: base.user.id, lessonId: lesson.id, eventType: "pause", positionSeconds: 270 });

      // progress = 270/300 * 100 = 90%
      expect(hasUserCompletedVideo({ userId: base.user.id, lessonId: lesson.id, videoDurationSeconds: 300, completionThreshold: 90 })).toBe(
        true
      );
    });

    it("should return true when progress exceeds the threshold", () => {
      logWatchEvent({ userId: base.user.id, lessonId: lesson.id, eventType: "pause", positionSeconds: 295 });

      // progress = 295/300 * 100 = 98%
      expect(hasUserCompletedVideo({ userId: base.user.id, lessonId: lesson.id, videoDurationSeconds: 300, completionThreshold: 90 })).toBe(
        true
      );
    });
  });

  // ─── getUserWatchHistory ───

  describe("getUserWatchHistory", () => {
    it("should return an empty array when no events exist", () => {
      const history = getUserWatchHistory(base.user.id);
      expect(history).toEqual([]);
    });

    it("should return watch history grouped by lesson", () => {
      const lesson2 = testDb
        .insert(schema.lessons)
        .values({ title: "Lesson 2", moduleId: mod.id, position: 2 })
        .returning()
        .get();

      logWatchEvent({ userId: base.user.id, lessonId: lesson.id, eventType: "play", positionSeconds: 0 });
      logWatchEvent({ userId: base.user.id, lessonId: lesson.id, eventType: "pause", positionSeconds: 60 });
      logWatchEvent({ userId: base.user.id, lessonId: lesson2.id, eventType: "play", positionSeconds: 0 });

      const history = getUserWatchHistory(base.user.id);
      expect(history).toHaveLength(2);

      const lesson1Entry = history.find((h) => h.lessonId === lesson.id);
      const lesson2Entry = history.find((h) => h.lessonId === lesson2.id);

      expect(lesson1Entry).toBeDefined();
      expect(lesson1Entry!.eventCount).toBe(2);
      expect(lesson1Entry!.lastPosition).toBe(60);

      expect(lesson2Entry).toBeDefined();
      expect(lesson2Entry!.eventCount).toBe(1);
      expect(lesson2Entry!.lastPosition).toBe(0);
    });

    it("should not include events from other users", () => {
      logWatchEvent({ userId: base.user.id, lessonId: lesson.id, eventType: "play", positionSeconds: 0 });
      logWatchEvent({ userId: base.instructor.id, lessonId: lesson.id, eventType: "play", positionSeconds: 30 });

      const history = getUserWatchHistory(base.user.id);
      expect(history).toHaveLength(1);
      expect(history[0].eventCount).toBe(1);
    });
  });

  // ─── deleteWatchEvents ───

  describe("deleteWatchEvents", () => {
    it("should return an empty array when no events exist", () => {
      const deleted = deleteWatchEvents({ userId: base.user.id, lessonId: lesson.id });
      expect(deleted).toEqual([]);
    });

    it("should delete all events for a user and lesson and return them", () => {
      logWatchEvent({ userId: base.user.id, lessonId: lesson.id, eventType: "play", positionSeconds: 0 });
      logWatchEvent({ userId: base.user.id, lessonId: lesson.id, eventType: "pause", positionSeconds: 30 });
      logWatchEvent({ userId: base.user.id, lessonId: lesson.id, eventType: "seek", positionSeconds: 60 });

      const deleted = deleteWatchEvents({ userId: base.user.id, lessonId: lesson.id });
      expect(deleted).toHaveLength(3);

      const remaining = getWatchEvents({ userId: base.user.id, lessonId: lesson.id });
      expect(remaining).toEqual([]);
    });

    it("should not delete events from other users", () => {
      logWatchEvent({ userId: base.user.id, lessonId: lesson.id, eventType: "play", positionSeconds: 0 });
      logWatchEvent({ userId: base.instructor.id, lessonId: lesson.id, eventType: "play", positionSeconds: 10 });

      deleteWatchEvents({ userId: base.user.id, lessonId: lesson.id });

      const instructorEvents = getWatchEvents({ userId: base.instructor.id, lessonId: lesson.id });
      expect(instructorEvents).toHaveLength(1);
    });

    it("should not delete events from other lessons", () => {
      const lesson2 = testDb
        .insert(schema.lessons)
        .values({ title: "Lesson 2", moduleId: mod.id, position: 2 })
        .returning()
        .get();

      logWatchEvent({ userId: base.user.id, lessonId: lesson.id, eventType: "play", positionSeconds: 0 });
      logWatchEvent({ userId: base.user.id, lessonId: lesson2.id, eventType: "play", positionSeconds: 20 });

      deleteWatchEvents({ userId: base.user.id, lessonId: lesson.id });

      const lesson2Events = getWatchEvents({ userId: base.user.id, lessonId: lesson2.id });
      expect(lesson2Events).toHaveLength(1);
    });
  });
});
