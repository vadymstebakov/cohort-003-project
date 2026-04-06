import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

import {
  createNotification,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} from "./notificationService";
import { NotificationType } from "~/db/schema";

describe("notificationService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("createNotification", () => {
    it("creates a notification with all fields", () => {
      const notification = createNotification({
        recipientUserId: base.instructor.id,
        type: NotificationType.Enrollment,
        title: "New Enrollment",
        message: "Test User enrolled in Test Course",
        linkUrl: `/instructor/${base.course.id}/students`,
      });

      expect(notification).toBeDefined();
      expect(notification.recipientUserId).toBe(base.instructor.id);
      expect(notification.type).toBe(NotificationType.Enrollment);
      expect(notification.title).toBe("New Enrollment");
      expect(notification.message).toBe("Test User enrolled in Test Course");
      expect(notification.linkUrl).toBe(
        `/instructor/${base.course.id}/students`
      );
      expect(notification.isRead).toBe(false);
      expect(notification.createdAt).toBeDefined();
    });
  });

  describe("getNotifications", () => {
    it("returns notifications ordered by most recent first", () => {
      createNotification({
        recipientUserId: base.instructor.id,
        type: NotificationType.Enrollment,
        title: "First",
        message: "First notification",
        linkUrl: "/instructor/1/students",
      });
      createNotification({
        recipientUserId: base.instructor.id,
        type: NotificationType.Enrollment,
        title: "Second",
        message: "Second notification",
        linkUrl: "/instructor/1/students",
      });

      const notifications = getNotifications(base.instructor.id, 10, 0);
      expect(notifications).toHaveLength(2);
      expect(notifications[0].title).toBe("Second");
      expect(notifications[1].title).toBe("First");
    });

    it("respects limit and offset", () => {
      for (let i = 0; i < 10; i++) {
        createNotification({
          recipientUserId: base.instructor.id,
          type: NotificationType.Enrollment,
          title: `Notification ${i}`,
          message: `Message ${i}`,
          linkUrl: "/instructor/1/students",
        });
      }

      const page = getNotifications(base.instructor.id, 5, 0);
      expect(page).toHaveLength(5);

      const page2 = getNotifications(base.instructor.id, 5, 5);
      expect(page2).toHaveLength(5);

      // No overlap
      const ids1 = page.map((n) => n.id);
      const ids2 = page2.map((n) => n.id);
      expect(ids1.filter((id) => ids2.includes(id))).toHaveLength(0);
    });

    it("only returns notifications for the specified user", () => {
      createNotification({
        recipientUserId: base.instructor.id,
        type: NotificationType.Enrollment,
        title: "For instructor",
        message: "msg",
        linkUrl: "/test",
      });
      createNotification({
        recipientUserId: base.user.id,
        type: NotificationType.Enrollment,
        title: "For student",
        message: "msg",
        linkUrl: "/test",
      });

      const instructorNotifs = getNotifications(base.instructor.id, 10, 0);
      expect(instructorNotifs).toHaveLength(1);
      expect(instructorNotifs[0].title).toBe("For instructor");

      const studentNotifs = getNotifications(base.user.id, 10, 0);
      expect(studentNotifs).toHaveLength(1);
      expect(studentNotifs[0].title).toBe("For student");
    });
  });

  describe("getUnreadCount", () => {
    it("returns the count of unread notifications", () => {
      createNotification({
        recipientUserId: base.instructor.id,
        type: NotificationType.Enrollment,
        title: "Unread",
        message: "msg",
        linkUrl: "/test",
      });
      createNotification({
        recipientUserId: base.instructor.id,
        type: NotificationType.Enrollment,
        title: "Unread 2",
        message: "msg",
        linkUrl: "/test",
      });

      expect(getUnreadCount(base.instructor.id)).toBe(2);
    });

    it("returns 0 when all notifications are read", () => {
      const n = createNotification({
        recipientUserId: base.instructor.id,
        type: NotificationType.Enrollment,
        title: "Read",
        message: "msg",
        linkUrl: "/test",
      });
      markAsRead(n.id);

      expect(getUnreadCount(base.instructor.id)).toBe(0);
    });

    it("returns 0 when there are no notifications", () => {
      expect(getUnreadCount(base.instructor.id)).toBe(0);
    });
  });

  describe("markAsRead", () => {
    it("marks a single notification as read", () => {
      const n = createNotification({
        recipientUserId: base.instructor.id,
        type: NotificationType.Enrollment,
        title: "Test",
        message: "msg",
        linkUrl: "/test",
      });

      const result = markAsRead(n.id);
      expect(result).toBeDefined();
      expect(result!.isRead).toBe(true);
    });

    it("returns undefined for non-existent notification", () => {
      expect(markAsRead(9999)).toBeUndefined();
    });
  });

  describe("markAllAsRead", () => {
    it("marks all unread notifications as read for a user", () => {
      createNotification({
        recipientUserId: base.instructor.id,
        type: NotificationType.Enrollment,
        title: "One",
        message: "msg",
        linkUrl: "/test",
      });
      createNotification({
        recipientUserId: base.instructor.id,
        type: NotificationType.Enrollment,
        title: "Two",
        message: "msg",
        linkUrl: "/test",
      });

      markAllAsRead(base.instructor.id);

      expect(getUnreadCount(base.instructor.id)).toBe(0);
      const all = getNotifications(base.instructor.id, 10, 0);
      expect(all.every((n) => n.isRead)).toBe(true);
    });

    it("does not affect other users notifications", () => {
      createNotification({
        recipientUserId: base.instructor.id,
        type: NotificationType.Enrollment,
        title: "Instructor notif",
        message: "msg",
        linkUrl: "/test",
      });
      createNotification({
        recipientUserId: base.user.id,
        type: NotificationType.Enrollment,
        title: "Student notif",
        message: "msg",
        linkUrl: "/test",
      });

      markAllAsRead(base.instructor.id);

      expect(getUnreadCount(base.instructor.id)).toBe(0);
      expect(getUnreadCount(base.user.id)).toBe(1);
    });
  });
});
