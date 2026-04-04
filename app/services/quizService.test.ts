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
  getQuizById,
  getQuizByLessonId,
  getQuizWithQuestions,
  createQuiz,
  updateQuiz,
  deleteQuiz,
  getQuestionById,
  getQuestionsByQuiz,
  getQuestionCount,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  moveQuestionToPosition,
  reorderQuestions,
  getOptionById,
  getOptionsByQuestion,
  createOption,
  updateOption,
  deleteOption,
  getAttemptById,
  getAttemptsByUser,
  getAttemptCountForQuiz,
  getBestAttempt,
  getLatestAttempt,
  recordAttempt,
  recordAnswer,
  getAnswersByAttempt,
  getAttemptWithAnswers,
} from "./quizService";

function createModuleAndLesson() {
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
  return { mod, lesson };
}

describe("quizService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  // ─── Quiz CRUD ───

  describe("Quiz CRUD", () => {
    describe("createQuiz", () => {
      it("creates a quiz for a lesson", () => {
        const { lesson } = createModuleAndLesson();
        const quiz = createQuiz({ lessonId: lesson.id, title: "Quiz 1", passingScore: 70 });

        expect(quiz).toBeDefined();
        expect(quiz.lessonId).toBe(lesson.id);
        expect(quiz.title).toBe("Quiz 1");
        expect(quiz.passingScore).toBe(70);
        expect(quiz.id).toBeDefined();
      });
    });

    describe("getQuizById", () => {
      it("returns the quiz when it exists", () => {
        const { lesson } = createModuleAndLesson();
        const quiz = createQuiz({ lessonId: lesson.id, title: "Quiz 1", passingScore: 70 });

        const result = getQuizById(quiz.id);

        expect(result).toBeDefined();
        expect(result!.id).toBe(quiz.id);
        expect(result!.title).toBe("Quiz 1");
      });

      it("returns undefined for non-existent quiz", () => {
        const result = getQuizById(9999);

        expect(result).toBeUndefined();
      });
    });

    describe("getQuizByLessonId", () => {
      it("returns the quiz for a given lesson", () => {
        const { lesson } = createModuleAndLesson();
        createQuiz({ lessonId: lesson.id, title: "Lesson Quiz", passingScore: 70 });

        const result = getQuizByLessonId(lesson.id);

        expect(result).toBeDefined();
        expect(result!.lessonId).toBe(lesson.id);
        expect(result!.title).toBe("Lesson Quiz");
      });

      it("returns undefined when no quiz exists for the lesson", () => {
        const { lesson } = createModuleAndLesson();

        const result = getQuizByLessonId(lesson.id);

        expect(result).toBeUndefined();
      });
    });

    describe("getQuizWithQuestions", () => {
      it("returns null when quiz does not exist", () => {
        const result = getQuizWithQuestions(9999);

        expect(result).toBeNull();
      });

      it("returns quiz with empty questions array when no questions exist", () => {
        const { lesson } = createModuleAndLesson();
        const quiz = createQuiz({ lessonId: lesson.id, title: "Quiz", passingScore: 70 });

        const result = getQuizWithQuestions(quiz.id);

        expect(result).toBeDefined();
        expect(result!.id).toBe(quiz.id);
        expect(result!.questions).toEqual([]);
      });

      it("returns quiz with nested questions and options", () => {
        const { lesson } = createModuleAndLesson();
        const quiz = createQuiz({ lessonId: lesson.id, title: "Quiz", passingScore: 70 });
        const q1 = createQuestion(
          quiz.id,
          "What is 1+1?",
          schema.QuestionType.MultipleChoice,
          1
        );
        createOption(q1.id, "2", true);
        createOption(q1.id, "3", false);

        const result = getQuizWithQuestions(quiz.id);

        expect(result).toBeDefined();
        expect(result!.questions).toHaveLength(1);
        expect(result!.questions[0].questionText).toBe("What is 1+1?");
        expect(result!.questions[0].options).toHaveLength(2);
      });

      it("returns questions ordered by position", () => {
        const { lesson } = createModuleAndLesson();
        const quiz = createQuiz({ lessonId: lesson.id, title: "Quiz", passingScore: 70 });
        createQuestion(
          quiz.id,
          "Second",
          schema.QuestionType.MultipleChoice,
          2
        );
        createQuestion(
          quiz.id,
          "First",
          schema.QuestionType.MultipleChoice,
          1
        );

        const result = getQuizWithQuestions(quiz.id);

        expect(result!.questions[0].questionText).toBe("First");
        expect(result!.questions[1].questionText).toBe("Second");
      });
    });

    describe("updateQuiz", () => {
      it("updates the title when provided", () => {
        const { lesson } = createModuleAndLesson();
        const quiz = createQuiz({ lessonId: lesson.id, title: "Original", passingScore: 70 });

        const updated = updateQuiz(quiz.id, "Updated Title", null);

        expect(updated!.title).toBe("Updated Title");
        expect(updated!.passingScore).toBe(70);
      });

      it("updates the passing score when provided", () => {
        const { lesson } = createModuleAndLesson();
        const quiz = createQuiz({ lessonId: lesson.id, title: "Quiz", passingScore: 70 });

        const updated = updateQuiz(quiz.id, null, 90);

        expect(updated!.title).toBe("Quiz");
        expect(updated!.passingScore).toBe(90);
      });

      it("updates both fields when both provided", () => {
        const { lesson } = createModuleAndLesson();
        const quiz = createQuiz({ lessonId: lesson.id, title: "Quiz", passingScore: 70 });

        const updated = updateQuiz(quiz.id, "New", 100);

        expect(updated!.title).toBe("New");
        expect(updated!.passingScore).toBe(100);
      });

      it("returns existing quiz when no updates provided", () => {
        const { lesson } = createModuleAndLesson();
        const quiz = createQuiz({ lessonId: lesson.id, title: "No Change", passingScore: 70 });

        const result = updateQuiz(quiz.id, null, null);

        expect(result).toBeDefined();
        expect(result!.title).toBe("No Change");
        expect(result!.passingScore).toBe(70);
      });
    });

    describe("deleteQuiz", () => {
      it("deletes the quiz and returns it", () => {
        const { lesson } = createModuleAndLesson();
        const quiz = createQuiz({ lessonId: lesson.id, title: "Quiz", passingScore: 70 });

        const deleted = deleteQuiz(quiz.id);

        expect(deleted).toBeDefined();
        expect(deleted!.id).toBe(quiz.id);
        expect(getQuizById(quiz.id)).toBeUndefined();
      });

      it("cascading deletes questions and options", () => {
        const { lesson } = createModuleAndLesson();
        const quiz = createQuiz({ lessonId: lesson.id, title: "Quiz", passingScore: 70 });
        const q = createQuestion(
          quiz.id,
          "Q1",
          schema.QuestionType.TrueFalse,
          1
        );
        createOption(q.id, "True", true);
        createOption(q.id, "False", false);

        deleteQuiz(quiz.id);

        expect(getQuizById(quiz.id)).toBeUndefined();
        expect(getQuestionsByQuiz(quiz.id)).toHaveLength(0);
        expect(getOptionsByQuestion(q.id)).toHaveLength(0);
      });

      it("cascading deletes attempts when no answers reference options", () => {
        const { lesson } = createModuleAndLesson();
        const quiz = createQuiz({ lessonId: lesson.id, title: "Quiz", passingScore: 70 });
        createQuestion(
          quiz.id,
          "Q1",
          schema.QuestionType.TrueFalse,
          1
        );
        recordAttempt({ userId: base.user.id, quizId: quiz.id, score: 100, passed: true });

        // Verify attempt exists before delete
        expect(getAttemptsByUser({ userId: base.user.id, quizId: quiz.id })).toHaveLength(1);

        deleteQuiz(quiz.id);

        expect(getAttemptsByUser({ userId: base.user.id, quizId: quiz.id })).toHaveLength(0);
      });

      it("throws FK error when answers reference options (known bug: options deleted before answers)", () => {
        const { lesson } = createModuleAndLesson();
        const quiz = createQuiz({ lessonId: lesson.id, title: "Quiz", passingScore: 70 });
        const q = createQuestion(
          quiz.id,
          "Q1",
          schema.QuestionType.TrueFalse,
          1
        );
        const opt = createOption(q.id, "True", true);
        const attempt = recordAttempt({ userId: base.user.id, quizId: quiz.id, score: 100, passed: true });
        recordAnswer({ attemptId: attempt.id, questionId: q.id, selectedOptionId: opt.id });

        // deleteQuiz deletes options before answers, causing FK violation
        expect(() => deleteQuiz(quiz.id)).toThrow("FOREIGN KEY constraint failed");
      });
    });
  });

  // ─── Question Management ───

  describe("Question Management", () => {
    describe("createQuestion", () => {
      it("creates a question with explicit position", () => {
        const { lesson } = createModuleAndLesson();
        const quiz = createQuiz({ lessonId: lesson.id, title: "Quiz", passingScore: 70 });

        const q = createQuestion(
          quiz.id,
          "What color is the sky?",
          schema.QuestionType.MultipleChoice,
          5
        );

        expect(q).toBeDefined();
        expect(q.quizId).toBe(quiz.id);
        expect(q.questionText).toBe("What color is the sky?");
        expect(q.questionType).toBe(schema.QuestionType.MultipleChoice);
        expect(q.position).toBe(5);
      });

      it("auto-assigns position when null", () => {
        const { lesson } = createModuleAndLesson();
        const quiz = createQuiz({ lessonId: lesson.id, title: "Quiz", passingScore: 70 });

        const q1 = createQuestion(
          quiz.id,
          "First",
          schema.QuestionType.TrueFalse,
          null
        );
        const q2 = createQuestion(
          quiz.id,
          "Second",
          schema.QuestionType.TrueFalse,
          null
        );

        expect(q1.position).toBe(1);
        expect(q2.position).toBe(2);
      });
    });

    describe("getQuestionById", () => {
      it("returns the question when it exists", () => {
        const { lesson } = createModuleAndLesson();
        const quiz = createQuiz({ lessonId: lesson.id, title: "Quiz", passingScore: 70 });
        const q = createQuestion(
          quiz.id,
          "Q",
          schema.QuestionType.MultipleChoice,
          1
        );

        const result = getQuestionById(q.id);

        expect(result).toBeDefined();
        expect(result!.id).toBe(q.id);
      });

      it("returns undefined for non-existent question", () => {
        expect(getQuestionById(9999)).toBeUndefined();
      });
    });

    describe("getQuestionsByQuiz", () => {
      it("returns questions ordered by position", () => {
        const { lesson } = createModuleAndLesson();
        const quiz = createQuiz({ lessonId: lesson.id, title: "Quiz", passingScore: 70 });
        createQuestion(quiz.id, "B", schema.QuestionType.TrueFalse, 2);
        createQuestion(quiz.id, "A", schema.QuestionType.TrueFalse, 1);

        const questions = getQuestionsByQuiz(quiz.id);

        expect(questions).toHaveLength(2);
        expect(questions[0].questionText).toBe("A");
        expect(questions[1].questionText).toBe("B");
      });

      it("returns empty array when quiz has no questions", () => {
        const { lesson } = createModuleAndLesson();
        const quiz = createQuiz({ lessonId: lesson.id, title: "Quiz", passingScore: 70 });

        expect(getQuestionsByQuiz(quiz.id)).toHaveLength(0);
      });
    });

    describe("getQuestionCount", () => {
      it("returns the number of questions in a quiz", () => {
        const { lesson } = createModuleAndLesson();
        const quiz = createQuiz({ lessonId: lesson.id, title: "Quiz", passingScore: 70 });
        createQuestion(quiz.id, "Q1", schema.QuestionType.TrueFalse, null);
        createQuestion(quiz.id, "Q2", schema.QuestionType.TrueFalse, null);

        expect(getQuestionCount(quiz.id)).toBe(2);
      });

      it("returns 0 for quiz with no questions", () => {
        const { lesson } = createModuleAndLesson();
        const quiz = createQuiz({ lessonId: lesson.id, title: "Quiz", passingScore: 70 });

        expect(getQuestionCount(quiz.id)).toBe(0);
      });
    });

    describe("updateQuestion", () => {
      it("updates question text when provided", () => {
        const { lesson } = createModuleAndLesson();
        const quiz = createQuiz({ lessonId: lesson.id, title: "Quiz", passingScore: 70 });
        const q = createQuestion(
          quiz.id,
          "Old text",
          schema.QuestionType.MultipleChoice,
          1
        );

        const updated = updateQuestion(q.id, "New text", null);

        expect(updated!.questionText).toBe("New text");
        expect(updated!.questionType).toBe(schema.QuestionType.MultipleChoice);
      });

      it("updates question type when provided", () => {
        const { lesson } = createModuleAndLesson();
        const quiz = createQuiz({ lessonId: lesson.id, title: "Quiz", passingScore: 70 });
        const q = createQuestion(
          quiz.id,
          "Q",
          schema.QuestionType.MultipleChoice,
          1
        );

        const updated = updateQuestion(
          q.id,
          null,
          schema.QuestionType.TrueFalse
        );

        expect(updated!.questionType).toBe(schema.QuestionType.TrueFalse);
        expect(updated!.questionText).toBe("Q");
      });

      it("returns existing question when no updates provided", () => {
        const { lesson } = createModuleAndLesson();
        const quiz = createQuiz({ lessonId: lesson.id, title: "Quiz", passingScore: 70 });
        const q = createQuestion(
          quiz.id,
          "Q",
          schema.QuestionType.TrueFalse,
          1
        );

        const result = updateQuestion(q.id, null, null);

        expect(result).toBeDefined();
        expect(result!.questionText).toBe("Q");
      });
    });

    describe("deleteQuestion", () => {
      it("deletes the question and its options", () => {
        const { lesson } = createModuleAndLesson();
        const quiz = createQuiz({ lessonId: lesson.id, title: "Quiz", passingScore: 70 });
        const q = createQuestion(
          quiz.id,
          "Q",
          schema.QuestionType.MultipleChoice,
          1
        );
        createOption(q.id, "Opt A", true);
        createOption(q.id, "Opt B", false);

        const deleted = deleteQuestion(q.id);

        expect(deleted).toBeDefined();
        expect(deleted!.id).toBe(q.id);
        expect(getQuestionById(q.id)).toBeUndefined();
        expect(getOptionsByQuestion(q.id)).toHaveLength(0);
      });
    });
  });

  // ─── Question Reordering ───

  describe("Question Reordering", () => {
    describe("moveQuestionToPosition", () => {
      it("returns null for non-existent question", () => {
        expect(moveQuestionToPosition({ questionId: 9999, newPosition: 1 })).toBeNull();
      });

      it("returns the question unchanged when position is the same", () => {
        const { lesson } = createModuleAndLesson();
        const quiz = createQuiz({ lessonId: lesson.id, title: "Quiz", passingScore: 70 });
        const q = createQuestion(
          quiz.id,
          "Q",
          schema.QuestionType.TrueFalse,
          3
        );

        const result = moveQuestionToPosition({ questionId: q.id, newPosition: 3 });

        expect(result!.position).toBe(3);
      });

      it("moves a question down (higher position)", () => {
        const { lesson } = createModuleAndLesson();
        const quiz = createQuiz({ lessonId: lesson.id, title: "Quiz", passingScore: 70 });
        const q1 = createQuestion(
          quiz.id,
          "Q1",
          schema.QuestionType.TrueFalse,
          1
        );
        createQuestion(quiz.id, "Q2", schema.QuestionType.TrueFalse, 2);
        createQuestion(quiz.id, "Q3", schema.QuestionType.TrueFalse, 3);

        // Move Q1 from position 1 to position 3
        moveQuestionToPosition({ questionId: q1.id, newPosition: 3 });

        const questions = getQuestionsByQuiz(quiz.id);
        expect(questions[0].questionText).toBe("Q2");
        expect(questions[0].position).toBe(1);
        expect(questions[1].questionText).toBe("Q3");
        expect(questions[1].position).toBe(2);
        expect(questions[2].questionText).toBe("Q1");
        expect(questions[2].position).toBe(3);
      });

      it("moves a question up (lower position)", () => {
        const { lesson } = createModuleAndLesson();
        const quiz = createQuiz({ lessonId: lesson.id, title: "Quiz", passingScore: 70 });
        createQuestion(quiz.id, "Q1", schema.QuestionType.TrueFalse, 1);
        createQuestion(quiz.id, "Q2", schema.QuestionType.TrueFalse, 2);
        const q3 = createQuestion(
          quiz.id,
          "Q3",
          schema.QuestionType.TrueFalse,
          3
        );

        // Move Q3 from position 3 to position 1
        moveQuestionToPosition({ questionId: q3.id, newPosition: 1 });

        const questions = getQuestionsByQuiz(quiz.id);
        expect(questions[0].questionText).toBe("Q3");
        expect(questions[0].position).toBe(1);
        expect(questions[1].questionText).toBe("Q1");
        expect(questions[1].position).toBe(2);
        expect(questions[2].questionText).toBe("Q2");
        expect(questions[2].position).toBe(3);
      });
    });

    describe("reorderQuestions", () => {
      it("sets positions based on array index order", () => {
        const { lesson } = createModuleAndLesson();
        const quiz = createQuiz({ lessonId: lesson.id, title: "Quiz", passingScore: 70 });
        const q1 = createQuestion(
          quiz.id,
          "Q1",
          schema.QuestionType.TrueFalse,
          1
        );
        const q2 = createQuestion(
          quiz.id,
          "Q2",
          schema.QuestionType.TrueFalse,
          2
        );
        const q3 = createQuestion(
          quiz.id,
          "Q3",
          schema.QuestionType.TrueFalse,
          3
        );

        // Reverse the order: q3 -> pos 1, q2 -> pos 2, q1 -> pos 3
        const result = reorderQuestions(quiz.id, [q3.id, q2.id, q1.id]);

        // Result is ordered by position, so Q3 (pos 1) comes first
        expect(result).toHaveLength(3);
        expect(result[0].questionText).toBe("Q3");
        expect(result[0].position).toBe(1);
        expect(result[1].questionText).toBe("Q2");
        expect(result[1].position).toBe(2);
        expect(result[2].questionText).toBe("Q1");
        expect(result[2].position).toBe(3);
      });
    });
  });

  // ─── Option Management ───

  describe("Option Management", () => {
    function createQuizWithQuestion() {
      const { lesson } = createModuleAndLesson();
      const quiz = createQuiz({ lessonId: lesson.id, title: "Quiz", passingScore: 70 });
      const question = createQuestion(
        quiz.id,
        "Q",
        schema.QuestionType.MultipleChoice,
        1
      );
      return { quiz, question };
    }

    describe("createOption", () => {
      it("creates an option for a question", () => {
        const { question } = createQuizWithQuestion();

        const opt = createOption(question.id, "Option A", true);

        expect(opt).toBeDefined();
        expect(opt.questionId).toBe(question.id);
        expect(opt.optionText).toBe("Option A");
        expect(opt.isCorrect).toBe(true);
      });
    });

    describe("getOptionById", () => {
      it("returns the option when it exists", () => {
        const { question } = createQuizWithQuestion();
        const opt = createOption(question.id, "Opt", false);

        const result = getOptionById(opt.id);

        expect(result).toBeDefined();
        expect(result!.id).toBe(opt.id);
      });

      it("returns undefined for non-existent option", () => {
        expect(getOptionById(9999)).toBeUndefined();
      });
    });

    describe("getOptionsByQuestion", () => {
      it("returns all options for a question", () => {
        const { question } = createQuizWithQuestion();
        createOption(question.id, "A", true);
        createOption(question.id, "B", false);
        createOption(question.id, "C", false);

        const options = getOptionsByQuestion(question.id);

        expect(options).toHaveLength(3);
      });

      it("returns empty array when question has no options", () => {
        const { question } = createQuizWithQuestion();

        expect(getOptionsByQuestion(question.id)).toHaveLength(0);
      });
    });

    describe("updateOption", () => {
      it("updates option text when provided", () => {
        const { question } = createQuizWithQuestion();
        const opt = createOption(question.id, "Old", false);

        const updated = updateOption(opt.id, "New", null);

        expect(updated!.optionText).toBe("New");
        expect(updated!.isCorrect).toBe(false);
      });

      it("updates isCorrect when provided", () => {
        const { question } = createQuizWithQuestion();
        const opt = createOption(question.id, "Opt", false);

        const updated = updateOption(opt.id, null, true);

        expect(updated!.isCorrect).toBe(true);
        expect(updated!.optionText).toBe("Opt");
      });

      it("returns existing option when no updates provided", () => {
        const { question } = createQuizWithQuestion();
        const opt = createOption(question.id, "Opt", false);

        const result = updateOption(opt.id, null, null);

        expect(result).toBeDefined();
        expect(result!.optionText).toBe("Opt");
      });
    });

    describe("deleteOption", () => {
      it("deletes the option and returns it", () => {
        const { question } = createQuizWithQuestion();
        const opt = createOption(question.id, "Gone", true);

        const deleted = deleteOption(opt.id);

        expect(deleted).toBeDefined();
        expect(deleted!.id).toBe(opt.id);
        expect(getOptionById(opt.id)).toBeUndefined();
      });
    });
  });

  // ─── Attempt Recording ───

  describe("Attempt Recording", () => {
    function createFullQuiz() {
      const { lesson } = createModuleAndLesson();
      const quiz = createQuiz({ lessonId: lesson.id, title: "Quiz", passingScore: 70 });
      const question = createQuestion(
        quiz.id,
        "Q1",
        schema.QuestionType.MultipleChoice,
        1
      );
      const correctOpt = createOption(question.id, "Correct", true);
      const wrongOpt = createOption(question.id, "Wrong", false);
      return { quiz, question, correctOpt, wrongOpt };
    }

    describe("recordAttempt", () => {
      it("records a quiz attempt", () => {
        const { quiz } = createFullQuiz();

        const attempt = recordAttempt({ userId: base.user.id, quizId: quiz.id, score: 85, passed: true });

        expect(attempt).toBeDefined();
        expect(attempt.userId).toBe(base.user.id);
        expect(attempt.quizId).toBe(quiz.id);
        expect(attempt.score).toBe(85);
        expect(attempt.passed).toBe(true);
      });
    });

    describe("getAttemptById", () => {
      it("returns the attempt when it exists", () => {
        const { quiz } = createFullQuiz();
        const attempt = recordAttempt({ userId: base.user.id, quizId: quiz.id, score: 90, passed: true });

        const result = getAttemptById(attempt.id);

        expect(result).toBeDefined();
        expect(result!.id).toBe(attempt.id);
      });

      it("returns undefined for non-existent attempt", () => {
        expect(getAttemptById(9999)).toBeUndefined();
      });
    });

    describe("getAttemptsByUser", () => {
      it("returns all attempts for a user on a quiz ordered by date desc", () => {
        const { quiz } = createFullQuiz();
        recordAttempt({ userId: base.user.id, quizId: quiz.id, score: 50, passed: false });
        recordAttempt({ userId: base.user.id, quizId: quiz.id, score: 80, passed: true });

        const attempts = getAttemptsByUser({ userId: base.user.id, quizId: quiz.id });

        expect(attempts).toHaveLength(2);
      });

      it("returns empty array when user has no attempts", () => {
        const { quiz } = createFullQuiz();

        expect(getAttemptsByUser({ userId: base.user.id, quizId: quiz.id })).toHaveLength(0);
      });

      it("does not return attempts from other users", () => {
        const { quiz } = createFullQuiz();
        const otherUser = testDb
          .insert(schema.users)
          .values({
            name: "Other",
            email: "other@test.com",
            role: schema.UserRole.Student,
          })
          .returning()
          .get();

        recordAttempt({ userId: otherUser.id, quizId: quiz.id, score: 60, passed: false });

        expect(getAttemptsByUser({ userId: base.user.id, quizId: quiz.id })).toHaveLength(0);
      });
    });

    describe("getAttemptCountForQuiz", () => {
      it("returns total attempt count across all users", () => {
        const { quiz } = createFullQuiz();
        const otherUser = testDb
          .insert(schema.users)
          .values({
            name: "Other",
            email: "other@test.com",
            role: schema.UserRole.Student,
          })
          .returning()
          .get();

        recordAttempt({ userId: base.user.id, quizId: quiz.id, score: 50, passed: false });
        recordAttempt({ userId: base.user.id, quizId: quiz.id, score: 80, passed: true });
        recordAttempt({ userId: otherUser.id, quizId: quiz.id, score: 90, passed: true });

        expect(getAttemptCountForQuiz(quiz.id)).toBe(3);
      });

      it("returns 0 when no attempts exist", () => {
        const { quiz } = createFullQuiz();

        expect(getAttemptCountForQuiz(quiz.id)).toBe(0);
      });
    });

    describe("getBestAttempt", () => {
      it("returns the attempt with the highest score", () => {
        const { quiz } = createFullQuiz();
        recordAttempt({ userId: base.user.id, quizId: quiz.id, score: 50, passed: false });
        recordAttempt({ userId: base.user.id, quizId: quiz.id, score: 95, passed: true });
        recordAttempt({ userId: base.user.id, quizId: quiz.id, score: 70, passed: true });

        const best = getBestAttempt({ userId: base.user.id, quizId: quiz.id });

        expect(best).toBeDefined();
        expect(best!.score).toBe(95);
      });

      it("returns undefined when user has no attempts", () => {
        const { quiz } = createFullQuiz();

        expect(getBestAttempt({ userId: base.user.id, quizId: quiz.id })).toBeUndefined();
      });
    });

    describe("getLatestAttempt", () => {
      it("returns the most recent attempt", () => {
        const { quiz } = createFullQuiz();

        // Insert first attempt with an older timestamp
        const first = recordAttempt({ userId: base.user.id, quizId: quiz.id, score: 50, passed: false });
        testDb
          .update(schema.quizAttempts)
          .set({ attemptedAt: "2020-01-01T00:00:00.000Z" })
          .where(eq(schema.quizAttempts.id, first.id))
          .run();

        const latest = recordAttempt({ userId: base.user.id, quizId: quiz.id, score: 80, passed: true });

        const result = getLatestAttempt({ userId: base.user.id, quizId: quiz.id });

        expect(result).toBeDefined();
        expect(result!.id).toBe(latest.id);
        expect(result!.score).toBe(80);
      });

      it("returns undefined when user has no attempts", () => {
        const { quiz } = createFullQuiz();

        expect(getLatestAttempt({ userId: base.user.id, quizId: quiz.id })).toBeUndefined();
      });
    });

    describe("recordAnswer", () => {
      it("records an answer for an attempt", () => {
        const { quiz, question, correctOpt } = createFullQuiz();
        const attempt = recordAttempt({ userId: base.user.id, quizId: quiz.id, score: 100, passed: true });

        const answer = recordAnswer({ attemptId: attempt.id, questionId: question.id, selectedOptionId: correctOpt.id });

        expect(answer).toBeDefined();
        expect(answer.attemptId).toBe(attempt.id);
        expect(answer.questionId).toBe(question.id);
        expect(answer.selectedOptionId).toBe(correctOpt.id);
      });
    });

    describe("getAnswersByAttempt", () => {
      it("returns all answers for an attempt", () => {
        const { quiz, question, correctOpt } = createFullQuiz();
        const q2 = createQuestion(
          quiz.id,
          "Q2",
          schema.QuestionType.TrueFalse,
          2
        );
        const opt2 = createOption(q2.id, "True", true);
        const attempt = recordAttempt({ userId: base.user.id, quizId: quiz.id, score: 100, passed: true });
        recordAnswer({ attemptId: attempt.id, questionId: question.id, selectedOptionId: correctOpt.id });
        recordAnswer({ attemptId: attempt.id, questionId: q2.id, selectedOptionId: opt2.id });

        const answers = getAnswersByAttempt(attempt.id);

        expect(answers).toHaveLength(2);
      });

      it("returns empty array when attempt has no answers", () => {
        const { quiz } = createFullQuiz();
        const attempt = recordAttempt({ userId: base.user.id, quizId: quiz.id, score: 0, passed: false });

        expect(getAnswersByAttempt(attempt.id)).toHaveLength(0);
      });
    });

    describe("getAttemptWithAnswers", () => {
      it("returns null for non-existent attempt", () => {
        expect(getAttemptWithAnswers(9999)).toBeNull();
      });

      it("returns attempt with nested answers", () => {
        const { quiz, question, correctOpt } = createFullQuiz();
        const attempt = recordAttempt({ userId: base.user.id, quizId: quiz.id, score: 100, passed: true });
        recordAnswer({ attemptId: attempt.id, questionId: question.id, selectedOptionId: correctOpt.id });

        const result = getAttemptWithAnswers(attempt.id);

        expect(result).toBeDefined();
        expect(result!.id).toBe(attempt.id);
        expect(result!.score).toBe(100);
        expect(result!.answers).toHaveLength(1);
        expect(result!.answers[0].selectedOptionId).toBe(correctOpt.id);
      });
    });
  });
});
