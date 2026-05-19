import { z } from "zod";

export const quizQuestionTypeSchema = z.enum([
  "multiple_choice",
  "true_false",
  "fill_blank",
  "short_answer",
]);

export type QuizQuestionType = z.infer<typeof quizQuestionTypeSchema>;

// The Zod schema is the source of truth that the AI SDK serializes into the
// JSON schema sent to the model with `strict: true`. Strict mode (used by
// OpenAI's gpt-5.x, Bedrock's Converse API, and Fireworks' tool-calling
// path) rejects unsupported keywords. The subset we may use:
//   - object / array / string / number / boolean / enum / const / null
//   - oneOf via discriminated unions (with a literal discriminator)
//   - every property marked `required` and `additionalProperties: false`
// Disallowed: min / max / minLength / maxLength / pattern / format /
// minItems / maxItems / multipleOf. So no string-length or array-length
// bounds here — wording/length guidance lives in the tool description and
// system prompt instead.
const baseQuestionFields = {
  id: z.string(),
  prompt: z.string(),
} as const;

export const quizQuestionSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...baseQuestionFields,
      type: z.literal("multiple_choice"),
      choices: z.array(z.string()),
    })
    .strict(),
  z
    .object({
      ...baseQuestionFields,
      type: z.literal("true_false"),
    })
    .strict(),
  z
    .object({
      // The model must use the literal "____" as the blank marker so the UI
      // can split the prompt into segments.
      ...baseQuestionFields,
      type: z.literal("fill_blank"),
    })
    .strict(),
  z
    .object({
      ...baseQuestionFields,
      type: z.literal("short_answer"),
    })
    .strict(),
]);

export type QuizQuestion = z.infer<typeof quizQuestionSchema>;

export const quizInputSchema = z
  .object({
    title: z.string(),
    questions: z.array(quizQuestionSchema),
  })
  .strict();

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

/**
 * Metadata stored on user UIMessages so the chat history can render attachment
 * chips and the original user prompt, while the transport still feeds the LLM
 * the fully expanded prompt (with note bodies).
 */
export interface QuizMessageMetadata {
  attachments?: Attachment[];
  /** The fully assembled prompt — what the LLM should see. */
  fullPrompt?: string;
  /**
   * Marks the user message as a quiz submission so the UI renders a card
   * instead of a plain text bubble. Only present on the "Submitted." reply
   * that fires after the user clicks the QuizCard submit button.
   */
  submission?: {
    quizTitle: string;
    /** The toolCallId of the QuizCard this user message is submitting for. */
    toolCallId: string;
    answers: QuizAnswer[];
  };
}
