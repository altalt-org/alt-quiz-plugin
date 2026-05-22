import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Folder as FolderIcon, FileText } from "lucide-react";
import type {
  PluginFolderNode,
  PluginNoteSummary,
} from "alt-plugin-sdk";
import type { Attachment } from "@/quiz/types";

export interface MentionAutocompleteProps {
  query: string;
  folderTree: PluginFolderNode[];
  allNotes: PluginNoteSummary[];
  onPick: (attachment: Attachment) => void;
  onDismiss: () => void;
}

export interface MentionAutocompleteHandle {
  /** Returns true if the keyboard event was consumed. */
  handleKeyDown: (event: React.KeyboardEvent) => boolean;
}

interface FlatRow {
  key: string;
  label: string;
  icon: "folder" | "note";
  attachment: Attachment;
}

function flattenFolders(
  nodes: PluginFolderNode[],
  depth: number,
  out: Array<PluginFolderNode & { depth: number }>,
): void {
  for (const node of nodes) {
    out.push({ ...node, depth });
    flattenFolders(node.children, depth + 1, out);
  }
}

function buildRows(
  folderTree: PluginFolderNode[],
  allNotes: PluginNoteSummary[],
  query: string,
): FlatRow[] {
  const needle = query.toLowerCase();
  const folders: Array<PluginFolderNode & { depth: number }> = [];
  flattenFolders(folderTree, 0, folders);

  const rows: FlatRow[] = [];
  for (const folder of folders) {
    if (!needle || folder.name.toLowerCase().includes(needle)) {
      rows.push({
        key: `folder-${folder.id}`,
        label: folder.name,
        icon: "folder",
        attachment: { kind: "folder", id: folder.id, name: folder.name },
      });
    }
  }
  for (const note of allNotes) {
    if (!needle || note.title.toLowerCase().includes(needle)) {
      rows.push({
        key: `note-${note.id}`,
        label: note.title,
        icon: "note",
        attachment: { kind: "note", id: note.id, title: note.title },
      });
    }
  }
  return rows.slice(0, 12);
}

export const MentionAutocomplete = forwardRef<
  MentionAutocompleteHandle,
  MentionAutocompleteProps
>(function MentionAutocomplete(
  { query, folderTree, allNotes, onPick, onDismiss },
  ref,
) {
  const rows = useMemo(
    () => buildRows(folderTree, allNotes, query),
    [folderTree, allNotes, query],
  );
  const [active, setActive] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setActive(rows.length === 0 ? -1 : 0);
  }, [rows.length, query]);

  useEffect(() => {
    const node = containerRef.current?.querySelector<HTMLButtonElement>(
      `[data-mention-index="${active}"]`,
    );
    node?.scrollIntoView({ block: "nearest" });
  }, [active]);

  useImperativeHandle(
    ref,
    () => ({
      handleKeyDown(event) {
        if (rows.length === 0) return false;
        if (event.key === "ArrowDown") {
          setActive(prev => (prev + 1) % rows.length);
          return true;
        }
        if (event.key === "ArrowUp") {
          setActive(prev => (prev - 1 + rows.length) % rows.length);
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          const row = rows[active];
          if (row) {
            onPick(row.attachment);
            return true;
          }
          return false;
        }
        if (event.key === "Escape") {
          onDismiss();
          return true;
        }
        return false;
      },
    }),
    [rows, active, onPick, onDismiss],
  );

  if (rows.length === 0) {
    return (
      <div
        ref={containerRef}
        data-testid="mention-autocomplete"
        className="absolute bottom-full left-0 right-0 mb-2 rounded-md border border-border/60 bg-popover px-3 py-2 text-xs text-muted-foreground shadow-md"
      >
        No matches for <span className="font-mono">@{query}</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-testid="mention-autocomplete"
      className="absolute bottom-full left-0 right-0 z-10 mb-2 max-h-64 overflow-auto rounded-md border border-border/60 bg-popover p-1 shadow-md"
    >
      <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        @{query || "…"}
      </p>
      {rows.map((row, index) => (
        <button
          key={row.key}
          type="button"
          data-mention-index={index}
          data-active={index === active ? "true" : undefined}
          onMouseDown={event => {
            event.preventDefault();
            onPick(row.attachment);
          }}
          onMouseEnter={() => setActive(index)}
          className={`flex w-full items-center gap-2 truncate rounded px-2 py-1 text-left text-sm ${
            index === active ? "bg-accent text-accent-foreground" : ""
          }`}
        >
          {row.icon === "folder" ? (
            <FolderIcon className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span className="truncate">{row.label}</span>
          <span className="ml-auto text-[10px] text-muted-foreground">
            {row.attachment.kind}
          </span>
        </button>
      ))}
    </div>
  );
});
