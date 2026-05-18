import { describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  MentionAutocomplete,
  type MentionAutocompleteHandle,
} from "./MentionAutocomplete";

const folderTree = [
  { id: 1, name: "Math", parentId: null, children: [] },
  { id: 2, name: "Physics", parentId: null, children: [] },
];

const notes = [
  {
    id: 11,
    title: "Limits",
    folderId: 1,
    status: "completed" as const,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: 12,
    title: "Math History",
    folderId: 1,
    status: "completed" as const,
    createdAt: "",
    updatedAt: "",
  },
];

function buildHarness(query: string) {
  const ref = createRef<MentionAutocompleteHandle>();
  const onPick = vi.fn();
  const onDismiss = vi.fn();
  render(
    <MentionAutocomplete
      ref={ref}
      query={query}
      folderTree={folderTree}
      allNotes={notes}
      onPick={onPick}
      onDismiss={onDismiss}
    />,
  );
  return { ref, onPick, onDismiss };
}

function key(name: string): React.KeyboardEvent {
  return {
    key: name,
    preventDefault: vi.fn(),
  } as unknown as React.KeyboardEvent;
}

describe("MentionAutocomplete", () => {
  it("filters folders and notes by case-insensitive substring", () => {
    buildHarness("math");
    const list = screen.getByTestId("mention-autocomplete");
    expect(list).toHaveTextContent("Math");
    expect(list).toHaveTextContent("Math History");
    expect(list).not.toHaveTextContent("Physics");
    expect(list).not.toHaveTextContent("Limits");
  });

  it("renders an empty-state message when nothing matches", () => {
    buildHarness("zzzzz");
    expect(screen.getByText(/no matches/i)).toBeInTheDocument();
  });

  it("supports arrow-key navigation and Enter selection", () => {
    const { ref, onPick } = buildHarness("");
    expect(ref.current).not.toBeNull();
    expect(
      screen.getByTestId("mention-autocomplete").querySelector(
        "[data-mention-index='0']",
      ),
    ).toHaveAttribute("data-active", "true");

    act(() => {
      expect(ref.current!.handleKeyDown(key("ArrowDown"))).toBe(true);
    });
    expect(
      screen.getByTestId("mention-autocomplete").querySelector(
        "[data-mention-index='1']",
      ),
    ).toHaveAttribute("data-active", "true");

    act(() => {
      expect(ref.current!.handleKeyDown(key("Enter"))).toBe(true);
    });
    expect(onPick).toHaveBeenCalledWith({
      kind: "folder",
      id: 2,
      name: "Physics",
    });
  });

  it("wraps around at the top with ArrowUp", () => {
    const { ref, onPick } = buildHarness("");
    act(() => {
      expect(ref.current!.handleKeyDown(key("ArrowUp"))).toBe(true);
    });
    act(() => {
      expect(ref.current!.handleKeyDown(key("Enter"))).toBe(true);
    });
    expect(onPick).toHaveBeenCalledWith({
      kind: "note",
      id: 12,
      title: "Math History",
    });
  });

  it("dismisses on Escape", () => {
    const { ref, onDismiss } = buildHarness("");
    act(() => {
      expect(ref.current!.handleKeyDown(key("Escape"))).toBe(true);
    });
    expect(onDismiss).toHaveBeenCalled();
  });

  it("picks a row on mouseDown without losing textarea focus", () => {
    const { onPick } = buildHarness("limits");
    const target = screen.getByText("Limits");
    fireEvent.mouseDown(target);
    expect(onPick).toHaveBeenCalledWith({
      kind: "note",
      id: 11,
      title: "Limits",
    });
  });
});
