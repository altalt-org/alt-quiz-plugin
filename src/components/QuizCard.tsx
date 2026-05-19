import { useId, useMemo, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  quizInputSchema,
  type QuizAnswer,
  type QuizInput,
  type QuizQuestion,
} from "@/quiz/types";

// Answers are keyed by question INDEX (not by id) so that quizzes whose
// questions happen to share ids (a real failure mode the model exhibits) keep
// every answer slot independent. The question.id is preserved when we emit the
// final submission payload.
type AnswerMap = Record<number, string>;

export interface QuizCardProps {
  input: unknown;
  state: "input-streaming" | "input-available" | "output-available" | "output-error";
  errorText?: string | undefined;
  chatStatus: "submitted" | "streaming" | "ready" | "error";
  /**
   * True if the parent has detected a submission user message tagged with
   * this card's toolCallId. The QuizCard itself does not own this state —
   * submission is a regular user message, not a tool result, so the source
   * of truth lives in the conversation.
   */
  submitted?: boolean;
  /** Answers from the matching submission message, for the locked-form view. */
  submittedAnswers?: QuizAnswer[];
  onSubmit: (answers: QuizAnswer[], quizTitle: string) => void;
}

function parseInput(input: unknown): QuizInput | null {
  const parsed = quizInputSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

function FillBlankPrompt({ prompt }: { prompt: string }) {
  const parts = prompt.split("____");
  return (
    <span>
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {i < parts.length - 1 && (
            <span className="mx-1 inline-block min-w-16 border-b-2 border-foreground/40 align-middle" />
          )}
        </span>
      ))}
    </span>
  );
}

function QuestionField({
  question,
  fieldKey,
  value,
  disabled,
  onChange,
}: {
  question: QuizQuestion;
  /**
   * A DOM-unique prefix for this question. Must NOT be derived from
   * `question.id` because models occasionally emit duplicate ids — both
   * within one quiz and across multiple QuizCards on the same page — which
   * would silently collapse the radio inputs into a single name group and
   * make clicks bleed across questions/cards.
   */
  fieldKey: string;
  value: string;
  disabled: boolean;
  onChange: (next: string) => void;
}) {
  switch (question.type) {
    case "multiple_choice":
      return (
        <div className="space-y-2">
          {question.choices.map((choice, idx) => {
            const inputId = `${fieldKey}-opt-${idx}`;
            return (
              <label
                key={inputId}
                htmlFor={inputId}
                className="flex cursor-pointer items-start gap-2 rounded-md border border-border/60 bg-background/40 p-2 text-sm hover:bg-background/60"
              >
                <input
                  id={inputId}
                  type="radio"
                  name={fieldKey}
                  className="mt-0.5"
                  disabled={disabled}
                  checked={value === choice}
                  onChange={() => onChange(choice)}
                />
                <span>{choice}</span>
              </label>
            );
          })}
        </div>
      );
    case "true_false":
      return (
        <div className="flex gap-2">
          {(["true", "false"] as const).map(option => (
            <label
              key={option}
              className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border border-border/60 bg-background/40 p-2 text-sm hover:bg-background/60"
            >
              <input
                type="radio"
                name={fieldKey}
                disabled={disabled}
                checked={value === option}
                onChange={() => onChange(option)}
              />
              <span className="capitalize">{option}</span>
            </label>
          ))}
        </div>
      );
    case "fill_blank":
      return (
        <input
          type="text"
          className="w-full rounded-md border border-border/60 bg-background/40 p-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="Type your answer"
          disabled={disabled}
          value={value}
          onChange={event => onChange(event.target.value)}
        />
      );
    case "short_answer":
      return (
        <textarea
          rows={3}
          className="w-full resize-y rounded-md border border-border/60 bg-background/40 p-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="Write a short answer"
          disabled={disabled}
          value={value}
          onChange={event => onChange(event.target.value)}
        />
      );
  }
}

export function QuizCard({
  input,
  state,
  errorText,
  chatStatus,
  submitted,
  submittedAnswers,
  onSubmit,
}: QuizCardProps) {
  const quiz = useMemo(() => parseInput(input), [input]);
  const cardId = useId();
  const [answers, setAnswers] = useState<AnswerMap>({});

  // Order matters: an `output-error` part has `input === undefined`, which
  // would otherwise fall into the `!quiz` branch and render the skeleton
  // forever. Surface the error first.
  if (state === "output-error") {
    return (
      <Card className="border-destructive/40">
        <CardContent className="py-3 text-sm text-destructive">
          {errorText ?? "Quiz failed to generate."}
        </CardContent>
      </Card>
    );
  }

  if (state === "input-streaming" || !quiz) {
    return (
      <Card className="w-full border-border/50">
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Generating quiz…</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  // When the parent says this card has a matching submission message,
  // render the locked view using those answers. We line them up by question
  // index so duplicate ids can't collapse onto each other.
  const lockedAnswersMap: AnswerMap = submittedAnswers
    ? Object.fromEntries(
        quiz.questions.map((_, idx) => [
          idx,
          submittedAnswers[idx]?.value ?? "",
        ]),
      )
    : {};
  const effectiveAnswers = submitted ? lockedAnswersMap : answers;
  const canSubmit = chatStatus === "ready" && !submitted;
  const allAnswered = quiz.questions.every(
    (_, idx) => (effectiveAnswers[idx] ?? "").trim(),
  );

  const handleChange = (idx: number, value: string): void => {
    setAnswers(prev => ({ ...prev, [idx]: value }));
  };

  const handleSubmit = (): void => {
    const payload: QuizAnswer[] = quiz.questions.map((q, idx) => ({
      id: q.id,
      value: (answers[idx] ?? "").trim(),
    }));
    onSubmit(payload, quiz.title);
  };

  return (
    <Card className="w-full border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">{quiz.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {quiz.questions.map((question, idx) => {
          const fieldKey = `${cardId}-q${idx}`;
          return (
            <div key={fieldKey} className="space-y-2">
              <div className="text-sm font-medium leading-relaxed">
                <span className="mr-2 text-muted-foreground">Q{idx + 1}.</span>
                {question.type === "fill_blank" ? (
                  <FillBlankPrompt prompt={question.prompt} />
                ) : (
                  question.prompt
                )}
              </div>
              <QuestionField
                question={question}
                fieldKey={fieldKey}
                value={effectiveAnswers[idx] ?? ""}
                disabled={submitted || chatStatus !== "ready"}
                onChange={next => handleChange(idx, next)}
              />
            </div>
          );
        })}

        <div className="flex items-center justify-end gap-2 pt-2">
          {submitted ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5" /> Submitted
            </span>
          ) : (
            <Button
              size="sm"
              disabled={!canSubmit || !allAnswered}
              onClick={handleSubmit}
            >
              Submit answers
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
