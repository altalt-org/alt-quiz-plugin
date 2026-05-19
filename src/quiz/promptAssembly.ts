import type {
  PluginFolderNode,
  PluginNoteContent,
  PluginNoteSummary,
} from "@alt/plugin-sdk";
import type { Attachment, QuizAnswer, QuizInput } from "./types";

export const SUBMISSION_TEXT_HEADER = "=== QUIZ SUBMISSION ===";

/**
 * Formats the user's quiz answers into a plain user-facing message the agent
 * grades. This is the message body sent on submit — there is NO tool result
 * channel involved. Keeping the format stable and grep-able lets the model
 * recognize it reliably across calls.
 */
export function formatQuizSubmission(
  quiz: QuizInput,
  answers: QuizAnswer[],
): string {
  const answerById = new Map(answers.map(a => [a.id, a.value] as const));
  const blocks = quiz.questions.map((question, idx) => {
    const value = answerById.get(question.id)?.trim() || "(no answer)";
    return `Q${idx + 1}. ${question.prompt}\nMy answer: ${value}`;
  });
  return [
    SUBMISSION_TEXT_HEADER,
    `Quiz: "${quiz.title}"`,
    "",
    blocks.join("\n\n"),
    "",
    "Please grade my answers.",
  ].join("\n");
}

export const QUIZ_SYSTEM_PROMPT = `You are a quiz creator embedded inside Alt, a lecture note-taking app. You converse normally with the user; the only special behavior is around the \`createQuiz\` tool and a quiz submission message.

=== Creating a quiz ===
When the user asks for a quiz, or asks to regenerate one:
1. Read the source notes attached below the "===NOTES===" line in their message (if any).
2. Choose appropriate question types from: multiple_choice, true_false, fill_blank, short_answer. You do NOT have to use all four.
3. Call the \`createQuiz\` tool to render the quiz. Each question is a flat object with EXACTLY these four keys: \`id\` (a unique string), \`type\` (one of \`multiple_choice\` / \`true_false\` / \`fill_blank\` / \`short_answer\`), \`prompt\`, \`choices\`. The \`choices\` field MUST be present on every question — populate it only for \`multiple_choice\`; for every other type set it to the empty array \`[]\`. For \`fill_blank\` use the literal token \`____\` (four underscores) at each blank inside \`prompt\`. The tool input must never contain answers, hints, or solutions.
4. After calling the tool, you may optionally add a brief friendly note like "Let me know if you want hints." Do NOT promise to grade — the user submits when they're ready, and only then.

=== Conversing freely ===
After a quiz is on screen, the user is free to:
- Ask for hints. Give hints that nudge without revealing the answer outright.
- Ask follow-up questions about the material. Answer normally.
- Ask for a different quiz, more questions, harder questions, etc. Call \`createQuiz\` again with new questions.
- Ignore the quiz entirely. That's fine; respond to whatever they actually said.

Do NOT volunteer to grade. Do NOT call \`createQuiz\` unless they asked for a new quiz.

=== Grading a submission ===
When the user submits a quiz, their message will start with the literal header \`${SUBMISSION_TEXT_HEADER}\` followed by the quiz title and the answers. When you see that header, grade the submission immediately.

Grading format (Markdown, use literally):

**Q1.** <question prompt>
- Your answer: <user's value>
- Correct answer: <the right answer per the source notes>
- ✅ Correct  /  ❌ Incorrect — <one-sentence rationale grounded in the source>

… repeat per question …

**Score: <correct>/<total>**

Rules:
- For short_answer / fill_blank, accept reasonable paraphrases. Be honest about ambiguous cases.
- Use the questions in the submission text to ground your grading; you can also reference the original tool call's input for the exact wording.
- Do NOT call \`createQuiz\` while grading. After grading you may invite the user to try another quiz.

=== Style ===
- Match the language of the source notes.
- Keep questions specific and grounded. No filler trivia.`;

export interface AssemblePromptOptions {
  userPrompt: string;
  attachments: Attachment[];
  folderTree: PluginFolderNode[];
  listNotesInFolder: (folderId: number) => Promise<PluginNoteSummary[]>;
  getNoteContent: (noteId: number) => Promise<PluginNoteContent>;
  /** Max notes to include after folder expansion. Hard cap to keep prompts sane. */
  maxNotes?: number;
}

export interface AssembledPrompt {
  system: string;
  userMessage: string;
  resolvedNoteIds: number[];
}

function collectDescendantFolderIds(
  rootId: number,
  tree: PluginFolderNode[],
): number[] {
  const ids: number[] = [];
  const walk = (nodes: PluginFolderNode[], inside: boolean): void => {
    for (const node of nodes) {
      const isMatch = inside || node.id === rootId;
      if (isMatch) ids.push(node.id);
      walk(node.children, isMatch);
    }
  };
  walk(tree, false);
  return ids;
}

export async function resolveAttachmentsToNoteIds(
  attachments: Attachment[],
  folderTree: PluginFolderNode[],
  listNotesInFolder: (folderId: number) => Promise<PluginNoteSummary[]>,
): Promise<number[]> {
  const seen = new Set<number>();
  const ordered: number[] = [];

  const push = (id: number): void => {
    if (seen.has(id)) return;
    seen.add(id);
    ordered.push(id);
  };

  for (const attachment of attachments) {
    if (attachment.kind === "note") {
      push(attachment.id);
      continue;
    }
    const folderIds = collectDescendantFolderIds(attachment.id, folderTree);
    for (const folderId of folderIds) {
      const notes = await listNotesInFolder(folderId);
      for (const note of notes) push(note.id);
    }
  }

  return ordered;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildNoteBlock(content: PluginNoteContent): string {
  const sections: string[] = [];
  if (content.transcript.trim()) {
    sections.push(`## Transcript\n\n${content.transcript.trim()}`);
  }
  if (content.memo.trim()) {
    sections.push(`## Memo\n\n${content.memo.trim()}`);
  }
  if (content.summary.trim()) {
    sections.push(`## Summary\n\n${content.summary.trim()}`);
  }
  const body = sections.length
    ? sections.join("\n\n")
    : "(no content available for this note)";
  return `<note id="${content.id}" title="${escapeXml(content.title)}">\n${body}\n</note>`;
}

export async function assemblePrompt(
  options: AssemblePromptOptions,
): Promise<AssembledPrompt> {
  const cap = options.maxNotes ?? 20;
  const ids = (
    await resolveAttachmentsToNoteIds(
      options.attachments,
      options.folderTree,
      options.listNotesInFolder,
    )
  ).slice(0, cap);

  const contents = await Promise.all(
    ids.map(id => options.getNoteContent(id).catch(() => null)),
  );
  const blocks = contents.filter((c): c is PluginNoteContent => c !== null).map(buildNoteBlock);

  const trimmedPrompt = options.userPrompt.trim();
  const userMessage = blocks.length
    ? `${trimmedPrompt || "Generate a quiz from the attached notes."}\n\n===NOTES===\n${blocks.join("\n\n")}`
    : trimmedPrompt ||
      "(No notes attached.) Ask the user to attach at least one note or folder before generating a quiz.";

  return {
    system: QUIZ_SYSTEM_PROMPT,
    userMessage,
    resolvedNoteIds: ids,
  };
}
