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
// We intentionally model questions as a single flat object instead of a
// discriminated union. Strict-mode constrained decoding (Bedrock Converse,
// Fireworks, OpenAI's `strict: true`) has a known quirk with `oneOf` /
// discriminated unions: once the discriminator (`type`) is sampled, the
// decoder still permits fields that are valid in any sibling branch — so
// `true_false` questions sometimes arrive with a stray `choices: []`. A flat
// schema with every field always required sidesteps that entirely. Non-MC
// questions emit an empty `choices` array, which the UI ignores.
export const quizQuestionSchema = z
  .object({
    id: z.string(),
    type: z.enum([
      "multiple_choice",
      "true_false",
      "fill_blank",
      "short_answer",
    ]),
    // For `fill_blank`, the model must include the literal token "____"
    // (four underscores) at each blank location so the UI can split the
    // prompt into segments.
    prompt: z.string(),
    // Only meaningful for `multiple_choice`; pass `[]` for the other types.
    choices: z.array(z.string()),
  })
  .strict();

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
