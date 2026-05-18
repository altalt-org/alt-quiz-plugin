import type {
  PluginFolderNode,
  PluginNoteContent,
  PluginNoteSummary,
} from "@alt/plugin-sdk";
import type { Attachment } from "./types";

export const QUIZ_SYSTEM_PROMPT = `You are a quiz creator embedded inside Alt, a lecture note-taking app.

Workflow rules:
1. Read the source notes the user attached below the "===NOTES===" line.
2. Decide which question types are appropriate for the material. The available types are: multiple_choice, true_false, fill_blank, short_answer. You do NOT have to use all four — pick the ones that fit the content.
3. Call the \`createQuiz\` tool EXACTLY ONCE to deliver the questions.
4. The tool input must NEVER contain answers, solutions, hints, or explanations. Only emit the questions themselves.
5. For fill_blank questions, write the prompt using the literal token "____" (four underscores) at each blank location.
6. After you have called the tool, wait. When the user submits their answers, you will receive them as the tool result. Then, and only then, grade the submission: mark each question correct or incorrect, give a one-sentence rationale per question, and report a final score (correct / total). Be honest about ambiguous short-answer cases — accept reasonable paraphrases.

Style:
- Keep the questions specific and grounded in the source. No filler trivia.
- Match the language of the source notes.`;

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
