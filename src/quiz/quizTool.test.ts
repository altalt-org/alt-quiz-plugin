import { describe, expect, it } from "vitest";
import { quizInputSchema, quizOutputSchema } from "./types";

describe("quiz tool schemas", () => {
  it("accepts each question type without answers", () => {
    expect(() =>
      quizInputSchema.parse({
        title: "Sample Quiz",
        questions: [
          {
            id: "q1",
            type: "multiple_choice",
            prompt: "What is 2 + 2?",
            choices: ["3", "4", "5"],
          },
          { id: "q2", type: "true_false", prompt: "The sky is blue." },
          {
            id: "q3",
            type: "fill_blank",
            prompt: "Water boils at ____ degrees Celsius.",
          },
          {
            id: "q4",
            type: "short_answer",
            prompt: "Explain Ohm's law in one sentence.",
          },
        ],
      }),
    ).not.toThrow();
  });

  it("rejects multiple_choice questions without enough choices", () => {
    expect(() =>
      quizInputSchema.parse({
        title: "Bad MC",
        questions: [
          {
            id: "q1",
            type: "multiple_choice",
            prompt: "Pick one.",
            choices: ["only"],
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects unknown question types", () => {
    expect(() =>
      quizInputSchema.parse({
        title: "Bad",
        questions: [{ id: "q1", type: "essay", prompt: "Write." }],
      }),
    ).toThrow();
  });

  it("ignores any answer-shaped fields the model might leak into input", () => {
    const parsed = quizInputSchema.parse({
      title: "Trying to sneak",
      questions: [
        {
          id: "q1",
          type: "multiple_choice",
          prompt: "Capital of France?",
          choices: ["Paris", "Madrid"],
          // @ts-expect-error: unknown field
          answer: "Paris",
        },
      ],
    });
    expect((parsed.questions[0] as Record<string, unknown>).answer).toBeUndefined();
  });

  it("validates submitted answer payloads", () => {
    expect(() =>
      quizOutputSchema.parse({
        answers: [
          { id: "q1", value: "Paris" },
          { id: "q2", value: "true" },
        ],
      }),
    ).not.toThrow();

    expect(() => quizOutputSchema.parse({ answers: [{ id: "q1" }] })).toThrow();
  });
});
