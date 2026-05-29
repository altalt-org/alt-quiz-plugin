import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { detectMentionAtCaret, MentionPicker } from "./MentionPicker";
import type { Attachment } from "@/quiz/types";

const folderTree = [
  {
    id: 1,
    name: "Math",
    parentId: null,
    children: [{ id: 2, name: "Calc 1", parentId: 1, children: [] }],
  },
  { id: 3, name: "Physics", parentId: null, children: [] },
];

const notes = [
  {
    id: 11,
    title: "Limits",
    folderId: 2,
    status: "completed" as const,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: 12,
    title: "Derivatives",
    folderId: 2,
    status: "completed" as const,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: 21,
    title: "Newton",
    folderId: 3,
    status: "completed" as const,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: 99,
    title: "Standalone Note",
    folderId: null,
    status: "completed" as const,
    createdAt: "",
    updatedAt: "",
  },
];

describe("detectMentionAtCaret", () => {
  it("returns null when no @ precedes the caret", () => {
    expect(detectMentionAtCaret("hello world", 5)).toBeNull();
  });

  it("returns the trimmed query when the caret is inside an @ mention", () => {
    const text = "look at @cal";
    expect(detectMentionAtCaret(text, text.length)).toEqual({
      triggerStart: 8,
      query: "cal",
    });
  });

  it("rejects mentions that have whitespace after the @ trigger", () => {
    expect(detectMentionAtCaret("hey @ go", 8)).toBeNull();
  });

  it("rejects @ used inside a word (e.g. emails)", () => {
    expect(detectMentionAtCaret("hi me@x", 7)).toBeNull();
  });
});

async function openPopover() {
  const user = userEvent.setup();
  await user.click(screen.getByTestId("mention-picker-trigger"));
  return user;
}

describe("MentionPicker", () => {
  it("renders chips for current attachments and removes them on click", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const attachments: Attachment[] = [
      { kind: "folder", id: 1, name: "Math" },
      { kind: "note", id: 11, title: "Limits" },
    ];

    render(
      <MentionPicker
        attachments={attachments}
        folderTree={folderTree}
        allNotes={notes}
        onChange={onChange}
      />,
    );

    expect(screen.getAllByTestId("mention-chip")).toHaveLength(2);
    await user.click(screen.getByLabelText("Remove Math"));
    expect(onChange).toHaveBeenCalledWith([
      { kind: "note", id: 11, title: "Limits" },
    ]);
  });

  it("starts with folders collapsed and only shows root folders + rootless notes", async () => {
    render(
      <MentionPicker
        attachments={[]}
        folderTree={folderTree}
        allNotes={notes}
        onChange={vi.fn()}
      />,
    );
    await openPopover();
    const tree = screen.getByTestId("mention-tree");
    expect(within(tree).getByText("Math")).toBeInTheDocument();
    expect(within(tree).getByText("Physics")).toBeInTheDocument();
    expect(within(tree).getByText("Standalone Note")).toBeInTheDocument();
    expect(within(tree).queryByText("Calc 1")).toBeNull();
    expect(within(tree).queryByText("Limits")).toBeNull();
  });

  it("expands a folder to reveal its child folders and notes", async () => {
    render(
      <MentionPicker
        attachments={[]}
        folderTree={folderTree}
        allNotes={notes}
        onChange={vi.fn()}
      />,
    );
    const user = await openPopover();
    const tree = screen.getByTestId("mention-tree");
    const mathRow = within(tree).getByText("Math").closest("div")!;
    await user.click(within(mathRow).getByRole("button", { name: /expand/i }));
    expect(within(tree).getByText("Calc 1")).toBeInTheDocument();

    const calcRow = within(tree).getByText("Calc 1").closest("div")!;
    await user.click(within(calcRow).getByRole("button", { name: /expand/i }));
    expect(within(tree).getByText("Limits")).toBeInTheDocument();
    expect(within(tree).getByText("Derivatives")).toBeInTheDocument();
  });

  it("attaches a specific note from inside a folder without attaching the folder", async () => {
    const onChange = vi.fn();
    render(
      <MentionPicker
        attachments={[]}
        folderTree={folderTree}
        allNotes={notes}
        onChange={onChange}
      />,
    );
    const user = await openPopover();
    const tree = screen.getByTestId("mention-tree");

    // Expand Math then Calc 1.
    await user.click(
      within(within(tree).getByText("Math").closest("div")!).getByRole(
        "button",
        { name: /expand/i },
      ),
    );
    await user.click(
      within(within(tree).getByText("Calc 1").closest("div")!).getByRole(
        "button",
        { name: /expand/i },
      ),
    );

    await user.click(within(tree).getByText("Limits"));
    expect(onChange).toHaveBeenLastCalledWith([
      { kind: "note", id: 11, title: "Limits" },
    ]);
  });

  it("attaches an entire folder when the folder row label is clicked", async () => {
    const onChange = vi.fn();
    render(
      <MentionPicker
        attachments={[]}
        folderTree={folderTree}
        allNotes={notes}
        onChange={onChange}
      />,
    );
    const user = await openPopover();
    await user.click(screen.getByText("Physics"));
    expect(onChange).toHaveBeenLastCalledWith([
      { kind: "folder", id: 3, name: "Physics" },
    ]);
  });

  it("expands matching folders automatically when searching", async () => {
    render(
      <MentionPicker
        attachments={[]}
        folderTree={folderTree}
        allNotes={notes}
        onChange={vi.fn()}
      />,
    );
    const user = await openPopover();
    const search = screen.getByPlaceholderText(/search/i);
    await user.type(search, "limit");
    const tree = screen.getByTestId("mention-tree");
    expect(within(tree).getByText("Limits")).toBeInTheDocument();
  });
});
