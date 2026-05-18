import { CheckCircle2 } from "lucide-react";

export interface SubmissionCardProps {
  quizTitle: string;
  answerCount: number;
}

export function SubmissionCard({
  quizTitle,
  answerCount,
}: SubmissionCardProps) {
  return (
    <div
      data-testid="submission-card"
      className="inline-flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary"
    >
      <CheckCircle2 className="h-3.5 w-3.5" />
      <span>
        Submitted {answerCount} {answerCount === 1 ? "answer" : "answers"}
      </span>
      <span className="text-primary/70">·</span>
      <span className="max-w-48 truncate text-primary/80">{quizTitle}</span>
    </div>
  );
}
