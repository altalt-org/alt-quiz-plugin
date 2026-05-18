import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { detectMentionAtCaret, MentionPicker } from "./MentionPicker";
import type { Attachment } from "@/quiz/types";

const folderTree = [
  {
    id: 1,
    name: "Math",
    parentId: null,
    children: [
      { id: 2, name: "Calc 1", parentId: 1, children: [] },
    ],
  },
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

  it("opens the popover and refreshes notes when the trigger is clicked", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <MentionPicker
        attachments={[]}
        folderTree={folderTree}
        allNotes={notes}
        onChange={vi.fn()}
        onRefresh={refresh}
      />,
    );
    await user.click(screen.getByTestId("mention-picker-trigger"));
    expect(refresh).toHaveBeenCalled();
  });

  it("adds a folder attachment when the matching command item is clicked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <MentionPicker
        attachments={[]}
        folderTree={folderTree}
        allNotes={notes}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByTestId("mention-picker-trigger"));
    const popover = await screen.findByTestId("mention-picker-popover");
    const mathItem = within(popover).getByText("Math");
    fireEvent.click(mathItem);
    expect(onChange).toHaveBeenCalledWith([
      { kind: "folder", id: 1, name: "Math" },
    ]);
  });
});
