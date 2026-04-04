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
  getAllUsers,
  getUserById,
  getUserByEmail,
  getUsersByRole,
  createUser,
  updateUser,
  updateUserRole,
} from "./userService";

describe("userService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  // ─── getAllUsers ───

  describe("getAllUsers", () => {
    it("returns all seeded users", () => {
      const users = getAllUsers();
      expect(users).toHaveLength(2);
      expect(users.map((u) => u.email)).toContain("test@example.com");
      expect(users.map((u) => u.email)).toContain("instructor@example.com");
    });

    it("returns newly created users as well", () => {
      createUser({ name: "New User", email: "new@example.com", role: schema.UserRole.Student, avatarUrl: null });
      const users = getAllUsers();
      expect(users).toHaveLength(3);
    });
  });

  // ─── getUserById ───

  describe("getUserById", () => {
    it("returns user when found", () => {
      const user = getUserById(base.user.id);
      expect(user).toBeDefined();
      expect(user!.name).toBe("Test User");
      expect(user!.email).toBe("test@example.com");
      expect(user!.role).toBe(schema.UserRole.Student);
    });

    it("returns undefined when not found", () => {
      const user = getUserById(99999);
      expect(user).toBeUndefined();
    });
  });

  // ─── getUserByEmail ───

  describe("getUserByEmail", () => {
    it("returns user when found", () => {
      const user = getUserByEmail("instructor@example.com");
      expect(user).toBeDefined();
      expect(user!.name).toBe("Test Instructor");
      expect(user!.role).toBe(schema.UserRole.Instructor);
    });

    it("returns undefined when email does not exist", () => {
      const user = getUserByEmail("nobody@example.com");
      expect(user).toBeUndefined();
    });
  });

  // ─── getUsersByRole ───

  describe("getUsersByRole", () => {
    it("returns users with the specified role", () => {
      const students = getUsersByRole(schema.UserRole.Student);
      expect(students).toHaveLength(1);
      expect(students[0].email).toBe("test@example.com");
    });

    it("returns instructors", () => {
      const instructors = getUsersByRole(schema.UserRole.Instructor);
      expect(instructors).toHaveLength(1);
      expect(instructors[0].email).toBe("instructor@example.com");
    });

    it("returns empty array for role with no users", () => {
      const admins = getUsersByRole(schema.UserRole.Admin);
      expect(admins).toHaveLength(0);
    });
  });

  // ─── createUser ───

  describe("createUser", () => {
    it("creates a user with all fields", () => {
      const user = createUser({
        name: "Alice",
        email: "alice@example.com",
        role: schema.UserRole.Student,
        avatarUrl: "https://example.com/avatar.png",
      });

      expect(user.id).toBeDefined();
      expect(user.name).toBe("Alice");
      expect(user.email).toBe("alice@example.com");
      expect(user.role).toBe(schema.UserRole.Student);
      expect(user.avatarUrl).toBe("https://example.com/avatar.png");
      expect(user.createdAt).toBeDefined();
    });

    it("creates a user with null avatarUrl", () => {
      const user = createUser({
        name: "Bob",
        email: "bob@example.com",
        role: schema.UserRole.Instructor,
        avatarUrl: null,
      });

      expect(user.name).toBe("Bob");
      expect(user.avatarUrl).toBeNull();
    });

    it("persists the user to the database", () => {
      const created = createUser({
        name: "Charlie",
        email: "charlie@example.com",
        role: schema.UserRole.Admin,
        avatarUrl: null,
      });

      const fetched = getUserById(created.id);
      expect(fetched).toBeDefined();
      expect(fetched!.email).toBe("charlie@example.com");
      expect(fetched!.role).toBe(schema.UserRole.Admin);
    });
  });

  // ─── updateUser ───

  describe("updateUser", () => {
    it("updates name, email, and bio", () => {
      const updated = updateUser({
        id: base.user.id,
        name: "Updated Name",
        email: "updated@example.com",
        bio: "A short bio",
      });

      expect(updated.name).toBe("Updated Name");
      expect(updated.email).toBe("updated@example.com");
      expect(updated.bio).toBe("A short bio");
    });

    it("sets bio to null", () => {
      // First set a bio
      updateUser({ id: base.user.id, name: "Test User", email: "test@example.com", bio: "Some bio" });

      // Then clear it
      const updated = updateUser({
        id: base.user.id,
        name: "Test User",
        email: "test@example.com",
        bio: null,
      });

      expect(updated.bio).toBeNull();
    });

    it("does not change other fields", () => {
      const updated = updateUser({
        id: base.user.id,
        name: "New Name",
        email: "new@example.com",
        bio: null,
      });

      expect(updated.role).toBe(schema.UserRole.Student);
      expect(updated.id).toBe(base.user.id);
    });
  });

  // ─── updateUserRole ───

  describe("updateUserRole", () => {
    it("changes the user role", () => {
      const updated = updateUserRole(base.user.id, schema.UserRole.Admin);

      expect(updated.role).toBe(schema.UserRole.Admin);
      expect(updated.id).toBe(base.user.id);
    });

    it("persists the role change", () => {
      updateUserRole(base.user.id, schema.UserRole.Instructor);

      const fetched = getUserById(base.user.id);
      expect(fetched!.role).toBe(schema.UserRole.Instructor);
    });

    it("does not change other fields", () => {
      const updated = updateUserRole(base.user.id, schema.UserRole.Admin);

      expect(updated.name).toBe("Test User");
      expect(updated.email).toBe("test@example.com");
    });
  });
});
