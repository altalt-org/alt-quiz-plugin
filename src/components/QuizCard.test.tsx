import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
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
    { id: "q2", type: "true_false", prompt: "The sky is blue.", choices: [] },
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
    await user.click(screen.getByLabelText(/true/i));
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
    await user.click(screen.getByLabelText(/true/i));
    await user.click(screen.getByRole("button", { name: /submit answers/i }));
    expect(onSubmit).toHaveBeenCalledWith(
      [
        { id: "q1", value: "4" },
        { id: "q2", value: "true" },
      ],
      expect.any(String),
    );
  });

  it("locks the form once the parent reports a matching submission", () => {
    render(
      <QuizCard
        input={sampleQuiz}
        state="output-available"
        submitted
        submittedAnswers={[
          { id: "q1", value: "4" },
          { id: "q2", value: "true" },
        ]}
        chatStatus="ready"
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /submit answers/i })).toBeNull();
    expect(screen.getByText(/submitted/i)).toBeInTheDocument();
  });

  it("isolates radio groups across two cards that share question ids", async () => {
    // Repro: the model generated two quizzes whose questions share ids
    // (q1, q2 …). The radios in both cards ended up in the same DOM `name`
    // group and label/id pair, so clicking an option in one card flipped or
    // un-checked options in the other.
    const user = userEvent.setup();
    const cardOneSubmit = vi.fn();
    const cardTwoSubmit = vi.fn();
    render(
      <div>
        <div data-testid="card-1">
          <QuizCard
            input={sampleQuiz}
            state="input-available"
            chatStatus="ready"
            onSubmit={cardOneSubmit}
          />
        </div>
        <div data-testid="card-2">
          <QuizCard
            input={sampleQuiz}
            state="input-available"
            chatStatus="ready"
            onSubmit={cardTwoSubmit}
          />
        </div>
      </div>,
    );

    const cardOne = screen.getByTestId("card-1");
    const cardTwo = screen.getByTestId("card-2");

    // Pick "4" for q1 and "true" for q2 in card ONE.
    await user.click(within(cardOne).getByLabelText("4"));
    await user.click(within(cardOne).getByLabelText(/true/i));

    // Now interact with card TWO. Pick a different multiple-choice answer
    // and the opposite true/false. Card ONE's state must NOT change.
    await user.click(within(cardTwo).getByLabelText("3"));
    await user.click(within(cardTwo).getByLabelText(/false/i));

    await user.click(
      within(cardOne).getByRole("button", { name: /submit answers/i }),
    );
    expect(cardOneSubmit).toHaveBeenCalledWith(
      [
        { id: "q1", value: "4" },
        { id: "q2", value: "true" },
      ],
      expect.any(String),
    );

    await user.click(
      within(cardTwo).getByRole("button", { name: /submit answers/i }),
    );
    expect(cardTwoSubmit).toHaveBeenCalledWith(
      [
        { id: "q1", value: "3" },
        { id: "q2", value: "false" },
      ],
      expect.any(String),
    );
  });

  it("isolates radio groups within one card even if questions share ids", async () => {
    // Repro: the model emitted a quiz where two true/false questions had the
    // same `id` ("q1"). The radios shared a DOM name group so clicking
    // question 2's "true" deselected question 1's previous pick.
    const dupeQuiz: QuizInput = {
      title: "Dupe IDs",
      questions: [
        { id: "q1", type: "true_false", prompt: "First T/F", choices: [] },
        { id: "q1", type: "true_false", prompt: "Second T/F", choices: [] },
      ],
    };
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <QuizCard
        input={dupeQuiz}
        state="input-available"
        chatStatus="ready"
        onSubmit={onSubmit}
      />,
    );
    const trueRadios = screen.getAllByLabelText(/true/i);
    const falseRadios = screen.getAllByLabelText(/false/i);
    expect(trueRadios).toHaveLength(2);
    await user.click(trueRadios[0]);
    await user.click(falseRadios[1]);
    expect(trueRadios[0]).toBeChecked();
    expect(falseRadios[1]).toBeChecked();
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
