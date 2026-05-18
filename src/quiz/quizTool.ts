import { tool } from "ai";
import { z } from "zod";
import { quizInputSchema, type QuizInput } from "./types";

/**
 * `createQuiz` only RENDERS a quiz UI. It is intentionally self-resolving:
 * the tool's job is "I have shown the user this quiz" — nothing more. The
 * user remains free to chat (ask for hints, request a different quiz, …)
 * without ever submitting. When they do submit, the QuizCard turns the
 * answers into a regular user message that the agent grades. No
 * programmatic enforcement of submit-before-continue.
 */
export const createQuizTool = tool({
  description:
    "Render a quiz to the user. The tool input must contain ONLY the questions — never answers, hints, or solutions. After calling this tool, do NOT continue with grading logic; the user may answer, ask follow-up questions, request hints, or ignore the quiz. They will submit their answers as a regular user message containing a formatted submission that you should then grade.",
  inputSchema: quizInputSchema,
  outputSchema: z.object({ status: z.literal("displayed") }),
  execute: async () => ({ status: "displayed" as const }),
});

export type QuizToolInput = QuizInput;

export const QUIZ_TOOL_PART_TYPE = "tool-createQuiz" as const;
