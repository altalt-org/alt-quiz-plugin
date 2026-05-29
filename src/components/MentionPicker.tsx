import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Folder as FolderIcon,
  FolderOpen,
  FileText,
  Plus,
  X,
  ChevronRight,
  ChevronDown,
  Search,
} from "lucide-react";
import type { PluginFolderNode, PluginNoteSummary } from "alt-plugin-sdk";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useT } from "@/i18n";
import type { Attachment } from "@/quiz/types";

export interface MentionPickerProps {
  attachments: Attachment[];
  folderTree: PluginFolderNode[];
  allNotes: PluginNoteSummary[];
  onChange: (next: Attachment[]) => void;
  onRefresh?: () => Promise<void>;
}

function attachmentKey(attachment: Attachment): string {
  return `${attachment.kind}:${attachment.id}`;
}

function makeFolderAttachment(folder: PluginFolderNode): Attachment {
  return { kind: "folder", id: folder.id, name: folder.name };
}

function makeNoteAttachment(note: PluginNoteSummary): Attachment {
  return { kind: "note", id: note.id, title: note.title };
}

interface TreeRowProps {
  depth: number;
  expanded: boolean;
  hasChildren: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  label: string;
  selected: boolean;
  onSelect: () => void;
  meta?: React.ReactNode;
}

function TreeRow({
  depth,
  expanded,
  hasChildren,
  onToggle,
  icon,
  label,
  selected,
  onSelect,
  meta,
}: TreeRowProps) {
  const t = useT();
  return (
    <div
      data-testid="tree-row"
      className={`group/tree-row flex items-center gap-1 rounded-sm px-1 py-1 text-sm ${
        selected ? "bg-primary/15" : "hover:bg-accent"
      }`}
      style={{ paddingLeft: `${depth * 12 + 4}px` }}
    >
      <button
        type="button"
        onClick={hasChildren ? onToggle : undefined}
        className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground"
        aria-label={
          hasChildren ? (expanded ? t("collapse") : t("expand")) : undefined
        }
        tabIndex={hasChildren ? 0 : -1}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )
        ) : null}
      </button>
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">
        {icon}
      </span>
      <button
        type="button"
        onClick={onSelect}
        className="min-w-0 flex-1 truncate text-left"
      >
        {label}
      </button>
      {meta}
    </div>
  );
}

interface NotesByFolder {
  byFolder: Map<number | null, PluginNoteSummary[]>;
}

function indexNotesByFolder(notes: PluginNoteSummary[]): NotesByFolder {
  const byFolder = new Map<number | null, PluginNoteSummary[]>();
  for (const note of notes) {
    const key = note.folderId ?? null;
    const bucket = byFolder.get(key) ?? [];
    bucket.push(note);
    byFolder.set(key, bucket);
  }
  for (const bucket of byFolder.values()) {
    bucket.sort((a, b) => a.title.localeCompare(b.title));
  }
  return { byFolder };
}

function matchesQuery(text: string, query: string): boolean {
  if (!query) return true;
  return text.toLowerCase().includes(query.toLowerCase());
}

function folderMatchesQuery(
  folder: PluginFolderNode,
  query: string,
  notesByFolder: Map<number | null, PluginNoteSummary[]>,
): boolean {
  if (!query) return true;
  if (matchesQuery(folder.name, query)) return true;
  const notes = notesByFolder.get(folder.id) ?? [];
  if (notes.some(note => matchesQuery(note.title, query))) return true;
  return folder.children.some(child =>
    folderMatchesQuery(child, query, notesByFolder),
  );
}

interface FolderRowsProps {
  folders: PluginFolderNode[];
  depth: number;
  query: string;
  notesByFolder: Map<number | null, PluginNoteSummary[]>;
  expanded: Set<number>;
  attachmentKeys: Set<string>;
  onToggleFolder: (folderId: number) => void;
  onAttach: (attachment: Attachment) => void;
}

function FolderRows({
  folders,
  depth,
  query,
  notesByFolder,
  expanded,
  attachmentKeys,
  onToggleFolder,
  onAttach,
}: FolderRowsProps) {
  return (
    <>
      {folders.map(folder => {
        if (!folderMatchesQuery(folder, query, notesByFolder)) return null;
        const isExpanded = expanded.has(folder.id) || query.length > 0;
        const folderNotes = notesByFolder.get(folder.id) ?? [];
        const hasChildren =
          folder.children.length > 0 || folderNotes.length > 0;
        const folderSelected = attachmentKeys.has(
          attachmentKey(makeFolderAttachment(folder)),
        );
        return (
          <div key={`folder-${folder.id}`}>
            <TreeRow
              depth={depth}
              expanded={isExpanded}
              hasChildren={hasChildren}
              onToggle={() => onToggleFolder(folder.id)}
              icon={
                isExpanded ? (
                  <FolderOpen className="h-3.5 w-3.5" />
                ) : (
                  <FolderIcon className="h-3.5 w-3.5" />
                )
              }
              label={folder.name}
              selected={folderSelected}
              onSelect={() => onAttach(makeFolderAttachment(folder))}
              meta={
                <span className="ml-1 shrink-0 text-[10px] tabular-nums text-muted-foreground">
                  {folderNotes.length || ""}
                </span>
              }
            />
            {isExpanded && (
              <>
                <FolderRows
                  folders={folder.children}
                  depth={depth + 1}
                  query={query}
                  notesByFolder={notesByFolder}
                  expanded={expanded}
                  attachmentKeys={attachmentKeys}
                  onToggleFolder={onToggleFolder}
                  onAttach={onAttach}
                />
                {folderNotes
                  .filter(note => matchesQuery(note.title, query))
                  .map(note => (
                    <TreeRow
                      key={`note-${note.id}`}
                      depth={depth + 1}
                      expanded={false}
                      hasChildren={false}
                      onToggle={() => {}}
                      icon={<FileText className="h-3.5 w-3.5" />}
                      label={note.title}
                      selected={attachmentKeys.has(
                        attachmentKey(makeNoteAttachment(note)),
                      )}
                      onSelect={() => onAttach(makeNoteAttachment(note))}
                    />
                  ))}
              </>
            )}
          </div>
        );
      })}
    </>
  );
}

export function MentionPicker({
  attachments,
  folderTree,
  allNotes,
  onChange,
  onRefresh,
}: MentionPickerProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const attachmentKeys = useMemo(
    () => new Set(attachments.map(attachmentKey)),
    [attachments],
  );
  const notesByFolder = useMemo(
    () => indexNotesByFolder(allNotes).byFolder,
    [allNotes],
  );
  const rootlessNotes = useMemo(
    () =>
      (notesByFolder.get(null) ?? []).filter(note =>
        matchesQuery(note.title, query),
      ),
    [notesByFolder, query],
  );

  useEffect(() => {
    if (open) void onRefresh?.();
  }, [open, onRefresh]);

  const handleToggleFolder = useCallback((folderId: number) => {
    setExpanded(current => {
      const next = new Set(current);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }, []);

  const handleAttach = useCallback(
    (attachment: Attachment) => {
      const key = attachmentKey(attachment);
      if (attachmentKeys.has(key)) {
        onChange(attachments.filter(a => attachmentKey(a) !== key));
      } else {
        onChange([...attachments, attachment]);
      }
    },
    [attachments, attachmentKeys, onChange],
  );

  const handleRemove = useCallback(
    (attachment: Attachment) => {
      const key = attachmentKey(attachment);
      onChange(attachments.filter(a => attachmentKey(a) !== key));
    },
    [attachments, onChange],
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1 px-2 text-xs"
            data-testid="mention-picker-trigger"
          >
            <Plus className="h-3 w-3" />
            {t("addNotes")}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-96 p-0"
          data-testid="mention-picker-popover"
        >
          <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={t("searchPlaceholder")}
              className="h-7 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
            />
          </div>
          <ScrollArea className="h-80">
            <div className="p-1" data-testid="mention-tree">
              <FolderRows
                folders={folderTree}
                depth={0}
                query={query}
                notesByFolder={notesByFolder}
                expanded={expanded}
                attachmentKeys={attachmentKeys}
                onToggleFolder={handleToggleFolder}
                onAttach={handleAttach}
              />
              {rootlessNotes.map(note => (
                <TreeRow
                  key={`root-note-${note.id}`}
                  depth={0}
                  expanded={false}
                  hasChildren={false}
                  onToggle={() => {}}
                  icon={<FileText className="h-3.5 w-3.5" />}
                  label={note.title}
                  selected={attachmentKeys.has(
                    attachmentKey(makeNoteAttachment(note)),
                  )}
                  onSelect={() => handleAttach(makeNoteAttachment(note))}
                />
              ))}
              {folderTree.length === 0 && rootlessNotes.length === 0 && (
                <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                  {t("noNotes")}
                </p>
              )}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>

      {attachments.map(attachment => (
        <span
          key={attachmentKey(attachment)}
          className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-xs"
          data-testid="mention-chip"
        >
          {attachment.kind === "folder" ? (
            <FolderIcon className="h-3 w-3" />
          ) : (
            <FileText className="h-3 w-3" />
          )}
          <span className="max-w-40 truncate">
            {attachment.kind === "folder" ? attachment.name : attachment.title}
          </span>
          <button
            type="button"
            onClick={() => handleRemove(attachment)}
            className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
            aria-label={t("removeAttachment", {
              name:
                attachment.kind === "folder"
                  ? attachment.name
                  : attachment.title,
            })}
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
    </div>
  );
}

export interface MentionMatch {
  triggerStart: number;
  query: string;
}

export function detectMentionAtCaret(
  text: string,
  caret: number,
): MentionMatch | null {
  if (caret <= 0 || caret > text.length) return null;
  const upToCaret = text.slice(0, caret);
  const atIndex = upToCaret.lastIndexOf("@");
  if (atIndex === -1) return null;
  if (atIndex > 0) {
    const before = upToCaret[atIndex - 1];
    if (before && !/\s/.test(before)) return null;
  }
  const query = upToCaret.slice(atIndex + 1);
  if (/\s/.test(query)) return null;
  return { triggerStart: atIndex, query };
}
