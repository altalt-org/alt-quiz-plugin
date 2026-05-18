import { z } from "zod";

export const quizQuestionTypeSchema = z.enum([
  "multiple_choice",
  "true_false",
  "fill_blank",
  "short_answer",
]);

export type QuizQuestionType = z.infer<typeof quizQuestionTypeSchema>;

const baseQuestionFields = {
  id: z.string().min(1).max(64),
  prompt: z.string().min(1).max(800),
} as const;

export const quizQuestionSchema = z.discriminatedUnion("type", [
  z.object({
    ...baseQuestionFields,
    type: z.literal("multiple_choice"),
    choices: z.array(z.string().min(1).max(300)).min(2).max(6),
  }),
  z.object({
    ...baseQuestionFields,
    type: z.literal("true_false"),
  }),
  z.object({
    // The model must use the literal "____" as the blank marker so the UI can
    // split the prompt into segments.
    ...baseQuestionFields,
    type: z.literal("fill_blank"),
  }),
  z.object({
    ...baseQuestionFields,
    type: z.literal("short_answer"),
  }),
]);

export type QuizQuestion = z.infer<typeof quizQuestionSchema>;

export const quizInputSchema = z.object({
  title: z.string().min(1).max(200),
  questions: z.array(quizQuestionSchema).min(1).max(20),
});

export type QuizInput = z.infer<typeof quizInputSchema>;

export const quizAnswerSchema = z.object({
  id: z.string().min(1),
  value: z.string(),
});

export type QuizAnswer = z.infer<typeof quizAnswerSchema>;

export const quizOutputSchema = z.object({
  answers: z.array(quizAnswerSchema),
});

export type QuizOutput = z.infer<typeof quizOutputSchema>;

export type Attachment =
  | { kind: "note"; id: number; title: string }
  | { kind: "folder"; id: number; name: string };
