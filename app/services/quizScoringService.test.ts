import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
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
  calculateGrade,
  getScore,
  computeResult,
  renderQuizResults,
} from "./quizScoringService";

// Helper: create a full quiz with MC and T/F questions, returning all IDs
function createQuizFixture() {
  const mod = testDb
    .insert(schema.modules)
    .values({ title: "Module 1", courseId: base.course.id, position: 1 })
    .returning()
    .get();
  const lesson = testDb
    .insert(schema.lessons)
    .values({ title: "Lesson 1", moduleId: mod.id, position: 1 })
    .returning()
    .get();
  const quiz = testDb
    .insert(schema.quizzes)
    .values({ lessonId: lesson.id, title: "Test Quiz", passingScore: 70 })
    .returning()
    .get();

  // MC question
  const mcQuestion = testDb
    .insert(schema.quizQuestions)
    .values({
      quizId: quiz.id,
      questionText: "What is 2+2?",
      questionType: schema.QuestionType.MultipleChoice,
      position: 1,
    })
    .returning()
    .get();
  const mcCorrect = testDb
    .insert(schema.quizOptions)
    .values({ questionId: mcQuestion.id, optionText: "4", isCorrect: true })
    .returning()
    .get();
  const mcWrong = testDb
    .insert(schema.quizOptions)
    .values({ questionId: mcQuestion.id, optionText: "5", isCorrect: false })
    .returning()
    .get();

  // T/F question
  const tfQuestion = testDb
    .insert(schema.quizQuestions)
    .values({
      quizId: quiz.id,
      questionText: "The sky is blue",
      questionType: schema.QuestionType.TrueFalse,
      position: 2,
    })
    .returning()
    .get();
  const tfCorrect = testDb
    .insert(schema.quizOptions)
    .values({ questionId: tfQuestion.id, optionText: "True", isCorrect: true })
    .returning()
    .get();
  const tfWrong = testDb
    .insert(schema.quizOptions)
    .values({
      questionId: tfQuestion.id,
      optionText: "False",
      isCorrect: false,
    })
    .returning()
    .get();

  return {
    quiz,
    mcQuestion,
    mcCorrect,
    mcWrong,
    tfQuestion,
    tfCorrect,
    tfWrong,
  };
}

describe("quizScoringService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  // ── calculateGrade ──────────────────────────────────────────────────
  describe("calculateGrade", () => {
    it("returns A for score >= 0.9", () => {
      expect(calculateGrade(0.9)).toBe("A");
      expect(calculateGrade(1.0)).toBe("A");
      expect(calculateGrade(0.95)).toBe("A");
    });

    it("returns B for score >= 0.8 and < 0.9", () => {
      expect(calculateGrade(0.8)).toBe("B");
      expect(calculateGrade(0.85)).toBe("B");
      expect(calculateGrade(0.89)).toBe("B");
    });

    it("returns C for score >= 0.7 and < 0.8", () => {
      expect(calculateGrade(0.7)).toBe("C");
      expect(calculateGrade(0.75)).toBe("C");
      expect(calculateGrade(0.79)).toBe("C");
    });

    it("returns D for score >= 0.6 and < 0.7", () => {
      expect(calculateGrade(0.6)).toBe("D");
      expect(calculateGrade(0.65)).toBe("D");
      expect(calculateGrade(0.69)).toBe("D");
    });

    it("returns F for score < 0.6", () => {
      expect(calculateGrade(0.59)).toBe("F");
      expect(calculateGrade(0.0)).toBe("F");
      expect(calculateGrade(0.5)).toBe("F");
    });
  });

  // ── getScore ────────────────────────────────────────────────────────
  describe("getScore", () => {
    it("returns failing result when quiz is not found", () => {
      const result = getScore({ quizId: 99999, answers: [] });
      expect(result).toEqual({ score: 0, passed: false, grade: "F" });
    });

    it("scores all correct answers", () => {
      const f = createQuizFixture();

      const answers = [
        { questionId: f.mcQuestion.id, selectedOptionId: f.mcCorrect.id },
        { questionId: f.tfQuestion.id, selectedOptionId: f.tfCorrect.id },
      ];

      const result = getScore({ quizId: f.quiz.id, answers });

      expect(result.score).toBe(1);
      expect(result.totalCorrect).toBe(2);
      expect(result.totalQuestions).toBe(2);
      expect(result.passed).toBe(true);
      expect(result.grade).toBe("A");
      expect(result.mcResult.correct).toBe(1);
      expect(result.mcResult.total).toBe(1);
      expect(result.tfResult.correct).toBe(1);
      expect(result.tfResult.total).toBe(1);
    });

    it("scores all wrong answers", () => {
      const f = createQuizFixture();

      const answers = [
        { questionId: f.mcQuestion.id, selectedOptionId: f.mcWrong.id },
        { questionId: f.tfQuestion.id, selectedOptionId: f.tfWrong.id },
      ];

      const result = getScore({ quizId: f.quiz.id, answers });

      expect(result.score).toBe(0);
      expect(result.totalCorrect).toBe(0);
      expect(result.totalQuestions).toBe(2);
      expect(result.passed).toBe(false);
      expect(result.grade).toBe("F");
    });

    it("scores mixed correct and wrong answers", () => {
      const f = createQuizFixture();

      const answers = [
        { questionId: f.mcQuestion.id, selectedOptionId: f.mcCorrect.id },
        { questionId: f.tfQuestion.id, selectedOptionId: f.tfWrong.id },
      ];

      const result = getScore({ quizId: f.quiz.id, answers });

      expect(result.score).toBe(0.5);
      expect(result.totalCorrect).toBe(1);
      expect(result.totalQuestions).toBe(2);
      expect(result.passed).toBe(false);
      expect(result.grade).toBe("F");
      expect(result.mcResult.correct).toBe(1);
      expect(result.tfResult.correct).toBe(0);
    });

    it("handles empty answers array", () => {
      const f = createQuizFixture();

      const result = getScore({ quizId: f.quiz.id, answers: [] });

      expect(result.score).toBe(0);
      expect(result.totalCorrect).toBe(0);
      expect(result.totalQuestions).toBe(2);
      expect(result.passed).toBe(false);
      expect(result.grade).toBe("F");
    });
  });

  // ── computeResult ──────────────────────────────────────────────────
  describe("computeResult", () => {
    it("returns null when quiz is not found", () => {
      const result = computeResult({ userId: base.user.id, quizId: 99999, selectedAnswers: {} });
      expect(result).toBeNull();
    });

    it("scores correctly and returns result object", () => {
      const f = createQuizFixture();

      const selectedAnswers: Record<number, number> = {
        [f.mcQuestion.id]: f.mcCorrect.id,
        [f.tfQuestion.id]: f.tfCorrect.id,
      };

      const result = computeResult({ userId: base.user.id, quizId: f.quiz.id, selectedAnswers });

      expect(result).not.toBeNull();
      expect(result.score).toBe(1);
      expect(result.passed).toBe(true);
      expect(result.grade).toBe("A");
      expect(result.totalCorrect).toBe(2);
      expect(result.totalQuestions).toBe(2);
      expect(result.attemptId).toBeDefined();
      expect(result.questionResults).toHaveLength(2);
    });

    it("records attempt in the database", () => {
      const f = createQuizFixture();

      const selectedAnswers: Record<number, number> = {
        [f.mcQuestion.id]: f.mcCorrect.id,
        [f.tfQuestion.id]: f.tfCorrect.id,
      };

      const result = computeResult({ userId: base.user.id, quizId: f.quiz.id, selectedAnswers });

      const attempt = testDb
        .select()
        .from(schema.quizAttempts)
        .where(
          eq(schema.quizAttempts.id, result.attemptId)
        )
        .get();

      expect(attempt).toBeDefined();
      expect(attempt!.userId).toBe(base.user.id);
      expect(attempt!.quizId).toBe(f.quiz.id);
      expect(attempt!.score).toBe(1);
      expect(attempt!.passed).toBe(true);
    });

    it("records answers in the database", () => {
      const f = createQuizFixture();

      const selectedAnswers: Record<number, number> = {
        [f.mcQuestion.id]: f.mcCorrect.id,
        [f.tfQuestion.id]: f.tfWrong.id,
      };

      const result = computeResult({ userId: base.user.id, quizId: f.quiz.id, selectedAnswers });

      const answers = testDb
        .select()
        .from(schema.quizAnswers)
        .where(
          eq(schema.quizAnswers.attemptId, result.attemptId)
        )
        .all();

      expect(answers).toHaveLength(2);

      const mcAnswer = answers.find(
        (a) => a.questionId === f.mcQuestion.id
      );
      expect(mcAnswer).toBeDefined();
      expect(mcAnswer!.selectedOptionId).toBe(f.mcCorrect.id);

      const tfAnswer = answers.find(
        (a) => a.questionId === f.tfQuestion.id
      );
      expect(tfAnswer).toBeDefined();
      expect(tfAnswer!.selectedOptionId).toBe(f.tfWrong.id);
    });

    it("handles unanswered questions", () => {
      const f = createQuizFixture();

      // Only answer the MC question, skip T/F
      const selectedAnswers: Record<number, number> = {
        [f.mcQuestion.id]: f.mcCorrect.id,
      };

      const result = computeResult({ userId: base.user.id, quizId: f.quiz.id, selectedAnswers });

      expect(result).not.toBeNull();
      expect(result.totalCorrect).toBe(1);
      expect(result.totalQuestions).toBe(2);
      expect(result.score).toBe(0.5);

      // Only the answered question should be recorded
      const answers = testDb
        .select()
        .from(schema.quizAnswers)
        .where(
          eq(schema.quizAnswers.attemptId, result.attemptId)
        )
        .all();
      expect(answers).toHaveLength(1);
    });

    it("returns correct questionResults for each question", () => {
      const f = createQuizFixture();

      const selectedAnswers: Record<number, number> = {
        [f.mcQuestion.id]: f.mcWrong.id,
        [f.tfQuestion.id]: f.tfCorrect.id,
      };

      const result = computeResult({ userId: base.user.id, quizId: f.quiz.id, selectedAnswers });

      const mcResult = result.questionResults.find(
        (r: any) => r.questionId === f.mcQuestion.id
      );
      expect(mcResult.correct).toBe(false);
      expect(mcResult.selectedOptionId).toBe(f.mcWrong.id);
      expect(mcResult.correctOptionId).toBe(f.mcCorrect.id);

      const tfResult = result.questionResults.find(
        (r: any) => r.questionId === f.tfQuestion.id
      );
      expect(tfResult.correct).toBe(true);
      expect(tfResult.selectedOptionId).toBe(f.tfCorrect.id);
      expect(tfResult.correctOptionId).toBe(f.tfCorrect.id);
    });
  });

  // ── renderQuizResults ──────────────────────────────────────────────
  describe("renderQuizResults", () => {
    it("returns passing message when passed is true", () => {
      const result = renderQuizResults({ score: 9, total: 10, passed: true, showAnswers: false, showExplanations: false });

      expect(result.passed).toBe(true);
      expect(result.message).toBe("Congratulations! You passed!");
    });

    it("returns failing message when passed is false", () => {
      const result = renderQuizResults({ score: 3, total: 10, passed: false, showAnswers: false, showExplanations: false });

      expect(result.passed).toBe(false);
      expect(result.message).toBe(
        "Sorry, you did not pass. Try again!"
      );
    });

    it("calculates percentage and grade correctly", () => {
      // 9/10 = 0.9 => A
      const resultA = renderQuizResults({ score: 9, total: 10, passed: true, showAnswers: false, showExplanations: false });
      expect(resultA.percentage).toBe(0.9);
      expect(resultA.grade).toBe("A");

      // 8/10 = 0.8 => B
      const resultB = renderQuizResults({ score: 8, total: 10, passed: true, showAnswers: false, showExplanations: false });
      expect(resultB.percentage).toBe(0.8);
      expect(resultB.grade).toBe("B");

      // 7/10 = 0.7 => C
      const resultC = renderQuizResults({ score: 7, total: 10, passed: true, showAnswers: false, showExplanations: false });
      expect(resultC.percentage).toBe(0.7);
      expect(resultC.grade).toBe("C");

      // 6/10 = 0.6 => D
      const resultD = renderQuizResults({ score: 6, total: 10, passed: false, showAnswers: false, showExplanations: false });
      expect(resultD.percentage).toBe(0.6);
      expect(resultD.grade).toBe("D");

      // 4/10 = 0.4 => F
      const resultF = renderQuizResults({ score: 4, total: 10, passed: false, showAnswers: false, showExplanations: false });
      expect(resultF.percentage).toBe(0.4);
      expect(resultF.grade).toBe("F");
    });

    it("includes showAnswers flag when true", () => {
      const result = renderQuizResults({ score: 5, total: 10, passed: false, showAnswers: true, showExplanations: false });

      expect(result.showAnswers).toBe(true);
      expect(result.showExplanations).toBeUndefined();
    });

    it("includes showExplanations flag when true", () => {
      const result = renderQuizResults({ score: 5, total: 10, passed: false, showAnswers: false, showExplanations: true });

      expect(result.showExplanations).toBe(true);
      expect(result.showAnswers).toBeUndefined();
    });

    it("includes both flags when both are true", () => {
      const result = renderQuizResults({ score: 5, total: 10, passed: false, showAnswers: true, showExplanations: true });

      expect(result.showAnswers).toBe(true);
      expect(result.showExplanations).toBe(true);
    });

    it("omits both flags when both are false", () => {
      const result = renderQuizResults({ score: 5, total: 10, passed: false, showAnswers: false, showExplanations: false });

      expect(result.showAnswers).toBeUndefined();
      expect(result.showExplanations).toBeUndefined();
    });

    it("handles zero total gracefully", () => {
      const result = renderQuizResults({ score: 0, total: 0, passed: false, showAnswers: false, showExplanations: false });

      expect(result.percentage).toBe(0);
      expect(result.grade).toBe("F");
      expect(result.passed).toBe(false);
    });

    it("preserves score and total in output", () => {
      const result = renderQuizResults({ score: 7, total: 10, passed: true, showAnswers: false, showExplanations: false });

      expect(result.score).toBe(7);
      expect(result.total).toBe(10);
    });
  });
});
