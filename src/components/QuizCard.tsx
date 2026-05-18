import { useMemo, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  quizInputSchema,
  type QuizAnswer,
  type QuizInput,
  type QuizOutput,
  type QuizQuestion,
} from "@/quiz/types";

type AnswerMap = Record<string, string>;

export interface QuizCardProps {
  input: unknown;
  state: "input-streaming" | "input-available" | "output-available" | "output-error";
  output?: QuizOutput | undefined;
  errorText?: string | undefined;
  chatStatus: "submitted" | "streaming" | "ready" | "error";
  onSubmit: (output: QuizOutput) => void;
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
  value,
  disabled,
  onChange,
}: {
  question: QuizQuestion;
  value: string;
  disabled: boolean;
  onChange: (next: string) => void;
}) {
  switch (question.type) {
    case "multiple_choice":
      return (
        <div className="space-y-2">
          {question.choices.map((choice, idx) => {
            const id = `${question.id}-${idx}`;
            return (
              <label
                key={id}
                htmlFor={id}
                className="flex cursor-pointer items-start gap-2 rounded-md border border-border/60 bg-background/40 p-2 text-sm hover:bg-background/60"
              >
                <input
                  id={id}
                  type="radio"
                  name={question.id}
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
                name={question.id}
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
  output,
  errorText,
  chatStatus,
  onSubmit,
}: QuizCardProps) {
  const quiz = useMemo(() => parseInput(input), [input]);
  const [answers, setAnswers] = useState<AnswerMap>({});

  if (state === "input-streaming" || !quiz) {
    return (
      <Card className="border-border/50">
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Generating quiz…</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  if (state === "output-error") {
    return (
      <Card className="border-destructive/40">
        <CardContent className="py-3 text-sm text-destructive">
          {errorText ?? "Quiz failed."}
        </CardContent>
      </Card>
    );
  }

  const isSubmitted = state === "output-available";
  const submittedAnswers: AnswerMap = output
    ? Object.fromEntries(output.answers.map(a => [a.id, a.value]))
    : {};
  const effectiveAnswers = isSubmitted ? submittedAnswers : answers;
  const canSubmit = chatStatus === "ready" && !isSubmitted;
  const allAnswered = quiz.questions.every(q => (effectiveAnswers[q.id] ?? "").trim());

  const handleChange = (id: string, value: string): void => {
    setAnswers(prev => ({ ...prev, [id]: value }));
  };

  const handleSubmit = (): void => {
    const payload: QuizOutput = {
      answers: quiz.questions.map(q => ({
        id: q.id,
        value: (answers[q.id] ?? "").trim(),
      })) satisfies QuizAnswer[],
    };
    onSubmit(payload);
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">{quiz.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {quiz.questions.map((question, idx) => (
          <div key={question.id} className="space-y-2">
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
              value={effectiveAnswers[question.id] ?? ""}
              disabled={isSubmitted || chatStatus !== "ready"}
              onChange={next => handleChange(question.id, next)}
            />
          </div>
        ))}

        <div className="flex items-center justify-end gap-2 pt-2">
          {isSubmitted ? (
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
