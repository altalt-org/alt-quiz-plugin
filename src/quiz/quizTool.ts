import { tool } from "ai";
import { quizInputSchema, quizOutputSchema, type QuizInput } from "./types";

/**
 * The `createQuiz` tool is user-resolved: the model emits the questions, the
 * UI renders them, and the user supplies the answers via `addToolOutput`.
 * No `execute()` is provided on purpose — the AI SDK leaves the tool in the
 * `input-available` state until the UI fills it in.
 */
export const createQuizTool = tool({
  description:
    "Generate a quiz from the attached source material. The tool input must contain ONLY the questions — never include answers, hints, or solutions. Choose only the question types that fit the material; you do not have to use all four. Call this tool exactly once per user request.",
  inputSchema: quizInputSchema,
  outputSchema: quizOutputSchema,
});

export type QuizToolInput = QuizInput;

export const QUIZ_TOOL_PART_TYPE = "tool-createQuiz" as const;
