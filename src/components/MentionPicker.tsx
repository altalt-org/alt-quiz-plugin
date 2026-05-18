import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Folder as FolderIcon,
  FileText,
  Plus,
  X,
  ChevronRight,
} from "lucide-react";
import type {
  PluginFolderNode,
  PluginNoteSummary,
} from "@alt/plugin-sdk";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { Attachment } from "@/quiz/types";

export interface MentionPickerProps {
  attachments: Attachment[];
  folderTree: PluginFolderNode[];
  allNotes: PluginNoteSummary[];
  onChange: (next: Attachment[]) => void;
  /** Reload remote data (folders + notes) when the popover opens. */
  onRefresh?: () => Promise<void>;
}

function flattenFolders(
  tree: PluginFolderNode[],
  depth = 0,
): Array<PluginFolderNode & { depth: number }> {
  const out: Array<PluginFolderNode & { depth: number }> = [];
  for (const node of tree) {
    out.push({ ...node, depth });
    if (node.children.length) out.push(...flattenFolders(node.children, depth + 1));
  }
  return out;
}

function makeFolderAttachment(folder: PluginFolderNode): Attachment {
  return { kind: "folder", id: folder.id, name: folder.name };
}

function makeNoteAttachment(note: PluginNoteSummary): Attachment {
  return { kind: "note", id: note.id, title: note.title };
}

function attachmentKey(attachment: Attachment): string {
  return `${attachment.kind}:${attachment.id}`;
}

export function MentionPicker({
  attachments,
  folderTree,
  allNotes,
  onChange,
  onRefresh,
}: MentionPickerProps) {
  const [open, setOpen] = useState(false);

  const attachmentKeys = useMemo(
    () => new Set(attachments.map(attachmentKey)),
    [attachments],
  );

  const folderRows = useMemo(() => flattenFolders(folderTree), [folderTree]);

  const handleToggle = useCallback(
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

  useEffect(() => {
    if (open) void onRefresh?.();
  }, [open, onRefresh]);

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
            Add notes
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-80 p-0"
          data-testid="mention-picker-popover"
        >
          <Command>
            <CommandInput placeholder="Search notes and folders…" />
            <CommandList className="max-h-72">
              <CommandEmpty>No matches.</CommandEmpty>
              {folderRows.length > 0 && (
                <CommandGroup heading="Folders">
                  {folderRows.map(folder => {
                    const selected = attachmentKeys.has(
                      attachmentKey(makeFolderAttachment(folder)),
                    );
                    return (
                      <CommandItem
                        key={`folder-${folder.id}`}
                        value={`folder ${folder.name}`}
                        onSelect={() =>
                          handleToggle(makeFolderAttachment(folder))
                        }
                        className="gap-2"
                      >
                        <span
                          aria-hidden
                          style={{ paddingLeft: `${folder.depth * 12}px` }}
                          className="flex items-center text-muted-foreground"
                        >
                          {folder.depth > 0 && (
                            <ChevronRight className="mr-0.5 h-3 w-3 opacity-40" />
                          )}
                          <FolderIcon className="h-3.5 w-3.5" />
                        </span>
                        <span className="truncate">{folder.name}</span>
                        {selected && (
                          <span className="ml-auto text-[10px] uppercase tracking-wide text-primary">
                            added
                          </span>
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
              {allNotes.length > 0 && (
                <CommandGroup heading="Notes">
                  {allNotes.map(note => {
                    const selected = attachmentKeys.has(
                      attachmentKey(makeNoteAttachment(note)),
                    );
                    return (
                      <CommandItem
                        key={`note-${note.id}`}
                        value={`note ${note.title}`}
                        onSelect={() => handleToggle(makeNoteAttachment(note))}
                        className="gap-2"
                      >
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="truncate">{note.title}</span>
                        {selected && (
                          <span className="ml-auto text-[10px] uppercase tracking-wide text-primary">
                            added
                          </span>
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
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
          <span className="max-w-32 truncate">
            {attachment.kind === "folder" ? attachment.name : attachment.title}
          </span>
          <button
            type="button"
            onClick={() => handleRemove(attachment)}
            className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
            aria-label={`Remove ${attachment.kind === "folder" ? attachment.name : attachment.title}`}
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

/**
 * Detects an active `@query` mention at the caret position. Returns null if
 * the caret is not currently inside a mention region.
 */
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
