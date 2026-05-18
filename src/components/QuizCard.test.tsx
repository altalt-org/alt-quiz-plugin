import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuizCard } from "./QuizCard";
import type { QuizInput } from "@/quiz/types";

const sampleQuiz: QuizInput = {
  title: "Sample Quiz",
  questions: [
    {
      id: "q1",
      type: "multiple_choice",
      prompt: "What is 2 + 2?",
      choices: ["3", "4", "5"],
    },
    { id: "q2", type: "true_false", prompt: "The sky is blue." },
  ],
};

describe("QuizCard", () => {
  it("renders a generating skeleton while the input is streaming", () => {
    render(
      <QuizCard
        input={sampleQuiz}
        state="input-streaming"
        chatStatus="streaming"
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByText(/generating quiz/i)).toBeInTheDocument();
  });

  it("disables Submit while the chat is still streaming", () => {
    render(
      <QuizCard
        input={sampleQuiz}
        state="input-available"
        chatStatus="streaming"
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /submit answers/i })).toBeDisabled();
  });

  it("requires every question to be answered before Submit enables", async () => {
    const user = userEvent.setup();
    render(
      <QuizCard
        input={sampleQuiz}
        state="input-available"
        chatStatus="ready"
        onSubmit={vi.fn()}
      />,
    );
    const submit = screen.getByRole("button", { name: /submit answers/i });
    expect(submit).toBeDisabled();
    await user.click(screen.getByLabelText("4"));
    await user.click(screen.getByLabelText("true"));
    expect(submit).toBeEnabled();
  });

  it("emits the user's answers when Submit is clicked", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <QuizCard
        input={sampleQuiz}
        state="input-available"
        chatStatus="ready"
        onSubmit={onSubmit}
      />,
    );
    await user.click(screen.getByLabelText("4"));
    await user.click(screen.getByLabelText("true"));
    await user.click(screen.getByRole("button", { name: /submit answers/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      answers: [
        { id: "q1", value: "4" },
        { id: "q2", value: "true" },
      ],
    });
  });

  it("locks the form once the tool output is available", () => {
    render(
      <QuizCard
        input={sampleQuiz}
        state="output-available"
        output={{
          answers: [
            { id: "q1", value: "4" },
            { id: "q2", value: "true" },
          ],
        }}
        chatStatus="ready"
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /submit answers/i })).toBeNull();
    expect(screen.getByText(/submitted/i)).toBeInTheDocument();
  });

  it("shows the error text when the tool output errored", () => {
    render(
      <QuizCard
        input={sampleQuiz}
        state="output-error"
        chatStatus="ready"
        errorText="boom"
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByText("boom")).toBeInTheDocument();
  });
});
