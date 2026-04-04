import { eq, and, sql } from "drizzle-orm";
import { db } from "~/db";
import { courseRatings } from "~/db/schema";

// ─── Rating Service ───
// Handles course star ratings: upsert, retrieval, and aggregation.

export function upsertRating(opts: { userId: number; courseId: number; rating: number }) {
  const { userId, courseId, rating } = opts;
  const existing = db
    .select()
    .from(courseRatings)
    .where(
      and(eq(courseRatings.userId, userId), eq(courseRatings.courseId, courseId))
    )
    .get();

  if (existing) {
    return db
      .update(courseRatings)
      .set({ rating, updatedAt: new Date().toISOString() })
      .where(eq(courseRatings.id, existing.id))
      .returning()
      .get();
  }

  return db
    .insert(courseRatings)
    .values({ userId, courseId, rating })
    .returning()
    .get();
}

export function getUserRating(opts: { userId: number; courseId: number }) {
  const { userId, courseId } = opts;
  return db
    .select()
    .from(courseRatings)
    .where(
      and(eq(courseRatings.userId, userId), eq(courseRatings.courseId, courseId))
    )
    .get();
}

export function getCourseRatingStats(courseId: number) {
  const result = db
    .select({
      averageRating: sql<number>`avg(${courseRatings.rating})`,
      ratingCount: sql<number>`count(*)`,
    })
    .from(courseRatings)
    .where(eq(courseRatings.courseId, courseId))
    .get();

  return {
    averageRating: result?.averageRating ?? 0,
    ratingCount: result?.ratingCount ?? 0,
  };
}

export function getCourseRatingStatsMap(courseIds: number[]) {
  if (courseIds.length === 0) return new Map<number, { averageRating: number; ratingCount: number }>();

  const results = db
    .select({
      courseId: courseRatings.courseId,
      averageRating: sql<number>`avg(${courseRatings.rating})`,
      ratingCount: sql<number>`count(*)`,
    })
    .from(courseRatings)
    .where(
      sql`${courseRatings.courseId} IN (${sql.join(
        courseIds.map((id) => sql`${id}`),
        sql`, `
      )})`
    )
    .groupBy(courseRatings.courseId)
    .all();

  const map = new Map<number, { averageRating: number; ratingCount: number }>();
  for (const row of results) {
    map.set(row.courseId, {
      averageRating: row.averageRating,
      ratingCount: row.ratingCount,
    });
  }
  return map;
}
