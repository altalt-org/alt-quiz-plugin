import { describe, expect, it, vi } from "vitest";
import type {
  PluginFolderNode,
  PluginNoteContent,
  PluginNoteSummary,
} from "alt-plugin-sdk";
import {
  assemblePrompt,
  formatQuizSubmission,
  QUIZ_SYSTEM_PROMPT,
  resolveAttachmentsToNoteIds,
  SUBMISSION_TEXT_HEADER,
} from "./promptAssembly";
import type { Attachment, QuizInput } from "./types";

const folderTree: PluginFolderNode[] = [
  {
    id: 1,
    name: "Math",
    parentId: null,
    children: [
      {
        id: 2,
        name: "Calc 1",
        parentId: 1,
        children: [],
      },
    ],
  },
  {
    id: 3,
    name: "Physics",
    parentId: null,
    children: [],
  },
];

const folderNotes: Record<number, PluginNoteSummary[]> = {
  1: [],
  2: [
    {
      id: 11,
      title: "Limits",
      folderId: 2,
      status: "completed",
      createdAt: "",
      updatedAt: "",
    },
    {
      id: 12,
      title: "Derivatives",
      folderId: 2,
      status: "completed",
      createdAt: "",
      updatedAt: "",
    },
  ],
  3: [
    {
      id: 21,
      title: "Newton",
      folderId: 3,
      status: "completed",
      createdAt: "",
      updatedAt: "",
    },
  ],
};

function noteContent(id: number, title: string): PluginNoteContent {
  return {
    id,
    title,
    transcript: `transcript-${id}`,
    memo: `memo-${id}`,
    summary: `summary-${id}`,
  };
}

describe("resolveAttachmentsToNoteIds", () => {
  it("expands a folder attachment into every note in its subtree, deduped", async () => {
    const attachments: Attachment[] = [
      { kind: "folder", id: 1, name: "Math" },
      { kind: "note", id: 11, title: "Limits" },
    ];
    const listNotesInFolder = vi.fn(
      async (folderId: number) => folderNotes[folderId] ?? [],
    );

    const ids = await resolveAttachmentsToNoteIds(
      attachments,
      folderTree,
      listNotesInFolder,
    );

    expect(ids).toEqual([11, 12]);
    expect(listNotesInFolder).toHaveBeenCalledWith(1);
    expect(listNotesInFolder).toHaveBeenCalledWith(2);
  });

  it("keeps every distinct note attachment when several are picked", async () => {
    const attachments: Attachment[] = [
      { kind: "note", id: 11, title: "Limits" },
      { kind: "note", id: 12, title: "Derivatives" },
      { kind: "note", id: 21, title: "Newton" },
    ];
    const ids = await resolveAttachmentsToNoteIds(
      attachments,
      folderTree,
      async () => [],
    );
    expect(ids).toEqual([11, 12, 21]);
  });

  it("preserves the order in which attachments were added", async () => {
    const ids = await resolveAttachmentsToNoteIds(
      [
        { kind: "note", id: 21, title: "Newton" },
        { kind: "folder", id: 2, name: "Calc 1" },
      ],
      folderTree,
      async folderId => folderNotes[folderId] ?? [],
    );
    expect(ids).toEqual([21, 11, 12]);
  });
});

describe("assemblePrompt", () => {
  it("builds a tagged note block per resolved attachment", async () => {
    const assembled = await assemblePrompt({
      userPrompt: "Focus on derivatives",
      attachments: [{ kind: "folder", id: 2, name: "Calc 1" }],
      folderTree,
      listNotesInFolder: async folderId => folderNotes[folderId] ?? [],
      getNoteContent: async id => noteContent(id, `Note ${id}`),
    });

    expect(assembled.system).toBe(QUIZ_SYSTEM_PROMPT);
    expect(assembled.resolvedNoteIds).toEqual([11, 12]);
    expect(assembled.userMessage).toContain("Focus on derivatives");
    expect(assembled.userMessage).toContain('<note id="11"');
    expect(assembled.userMessage).toContain('<note id="12"');
    expect(assembled.userMessage).toContain("## Transcript");
    expect(assembled.userMessage).toContain("## Memo");
    expect(assembled.userMessage).toContain("## Summary");
  });

  it("emits one <note> block per attached note when multiple are picked", async () => {
    const seen: number[] = [];
    const assembled = await assemblePrompt({
      userPrompt: "use these",
      attachments: [
        { kind: "note", id: 11, title: "Limits" },
        { kind: "note", id: 12, title: "Derivatives" },
        { kind: "note", id: 21, title: "Newton" },
      ],
      folderTree,
      listNotesInFolder: async () => [],
      getNoteContent: async id => {
        seen.push(id);
        return noteContent(id, `Note ${id}`);
      },
    });
    expect(seen).toEqual([11, 12, 21]);
    expect(assembled.resolvedNoteIds).toEqual([11, 12, 21]);
    expect(assembled.userMessage).toContain('<note id="11"');
    expect(assembled.userMessage).toContain('<note id="12"');
    expect(assembled.userMessage).toContain('<note id="21"');
  });

  it("falls back to a no-attachment hint when nothing is provided", async () => {
    const assembled = await assemblePrompt({
      userPrompt: "",
      attachments: [],
      folderTree,
      listNotesInFolder: async () => [],
      getNoteContent: async id => noteContent(id, "x"),
    });
    expect(assembled.resolvedNoteIds).toEqual([]);
    expect(assembled.userMessage).toMatch(/no notes attached/i);
  });

  it("caps the number of expanded notes", async () => {
    const bigFolder: PluginFolderNode[] = [
      { id: 99, name: "Big", parentId: null, children: [] },
    ];
    const notes = Array.from({ length: 30 }, (_, i) => ({
      id: 1000 + i,
      title: `n${i}`,
      folderId: 99,
      status: "completed" as const,
      createdAt: "",
      updatedAt: "",
    }));

    const assembled = await assemblePrompt({
      userPrompt: "",
      attachments: [{ kind: "folder", id: 99, name: "Big" }],
      folderTree: bigFolder,
      listNotesInFolder: async () => notes,
      getNoteContent: async id => noteContent(id, "x"),
      maxNotes: 5,
    });
    expect(assembled.resolvedNoteIds).toHaveLength(5);
  });

  it("escapes quotes in note titles inside the tag attribute", async () => {
    const assembled = await assemblePrompt({
      userPrompt: "",
      attachments: [{ kind: "note", id: 1, title: 'Has "quotes"' }],
      folderTree: [],
      listNotesInFolder: async () => [],
      getNoteContent: async () => ({
        id: 1,
        title: 'Has "quotes"',
        transcript: "t",
        memo: "",
        summary: "",
      }),
    });
    expect(assembled.userMessage).toContain('title="Has &quot;quotes&quot;"');
  });
});

describe("formatQuizSubmission", () => {
  const quiz: QuizInput = {
    title: "Algebra basics",
    questions: [
      {
        id: "q1",
        type: "multiple_choice",
        prompt: "What is 2 + 2?",
        choices: ["3", "4", "5"],
      },
      { id: "q2", type: "true_false", prompt: "The sky is blue." },
      { id: "q3", type: "short_answer", prompt: "Define a derivative." },
    ],
  };

  it("emits a header, the quiz title, and one Q/answer block per question", () => {
    const text = formatQuizSubmission(quiz, [
      { id: "q1", value: "4" },
      { id: "q2", value: "true" },
      { id: "q3", value: "rate of change" },
    ]);
    expect(text.startsWith(SUBMISSION_TEXT_HEADER)).toBe(true);
    expect(text).toContain('Quiz: "Algebra basics"');
    expect(text).toContain("Q1. What is 2 + 2?");
    expect(text).toContain("My answer: 4");
    expect(text).toContain("Q2. The sky is blue.");
    expect(text).toContain("My answer: true");
    expect(text).toContain("Q3. Define a derivative.");
    expect(text).toContain("My answer: rate of change");
    expect(text).toMatch(/Please grade/i);
  });

  it("falls back to (no answer) when a question has no submitted value", () => {
    const text = formatQuizSubmission(quiz, [
      { id: "q1", value: "4" },
      // q2 missing entirely
      { id: "q3", value: "   " },
    ]);
    expect(text).toContain("Q2. The sky is blue.\nMy answer: (no answer)");
    expect(text).toContain("Q3. Define a derivative.\nMy answer: (no answer)");
  });
});
