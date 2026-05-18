import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { alt } from "@alt/plugin-sdk";
import type {
  PluginFolderNode,
  PluginNoteSummary,
} from "@alt/plugin-sdk";
import { useChat } from "@ai-sdk/react";
import {
  lastAssistantMessageIsCompleteWithToolCalls,
  type ToolUIPart,
  type UIMessage,
} from "ai";

import { Button } from "@/components/ui/button";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Loader } from "@/components/ai-elements/loader";
import {
  detectMentionAtCaret,
  MentionPicker,
} from "@/components/MentionPicker";
import { QuizCard } from "@/components/QuizCard";
import { createAltChatTransport } from "@/quiz/altTransport";
import {
  ChatStore,
  deriveChatTitle,
  type ChatIndexEntry,
} from "@/quiz/chatStore";
import { assemblePrompt } from "@/quiz/promptAssembly";
import { createQuizTool, QUIZ_TOOL_PART_TYPE } from "@/quiz/quizTool";
import {
  QUIZ_SYSTEM_PROMPT,
} from "@/quiz/promptAssembly";
import type {
  Attachment,
  QuizOutput,
} from "@/quiz/types";

const HOST_AVAILABLE = typeof window !== "undefined" && "alt" in window;
const CHAT_TOOLS = { createQuiz: createQuizTool };

function newChatId(): string {
  return `chat-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

function isQuizToolPart(part: UIMessage["parts"][number]): part is ToolUIPart {
  return part.type === QUIZ_TOOL_PART_TYPE;
}

export default function App() {
  const chatStore = useMemo(() => new ChatStore(alt.storage), []);
  const transport = useMemo(
    () => createAltChatTransport<UIMessage>({ system: QUIZ_SYSTEM_PROMPT, tools: CHAT_TOOLS }),
    [],
  );

  const [chatId, setChatId] = useState<string>(newChatId);
  const [chatIndex, setChatIndex] = useState<ChatIndexEntry[]>([]);
  const [folderTree, setFolderTree] = useState<PluginFolderNode[]>([]);
  const [allNotes, setAllNotes] = useState<PluginNoteSummary[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [draft, setDraft] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const {
    messages,
    sendMessage,
    addToolOutput,
    status,
    setMessages,
    stop,
  } = useChat<UIMessage>({
    id: chatId,
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onError: error => {
      setErrorBanner(error.message);
    },
  });

  const refreshNotes = useCallback(async () => {
    if (!HOST_AVAILABLE) return;
    try {
      const [tree, notes] = await Promise.all([
        alt.notes.listFolders(),
        alt.notes.list({ limit: 200 }),
      ]);
      setFolderTree(tree);
      setAllNotes(notes);
    } catch (error) {
      setErrorBanner(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const refreshChatIndex = useCallback(async () => {
    if (!HOST_AVAILABLE) return;
    setChatIndex(await chatStore.list());
  }, [chatStore]);

  useEffect(() => {
    void refreshNotes();
    void refreshChatIndex();
  }, [refreshNotes, refreshChatIndex]);

  // Persist current chat whenever it settles.
  useEffect(() => {
    if (!HOST_AVAILABLE || messages.length === 0 || status !== "ready") return;
    const now = new Date().toISOString();
    void chatStore
      .save({
        id: chatId,
        title: deriveChatTitle(messages),
        messages,
        createdAt: now,
        updatedAt: now,
      })
      .then(refreshChatIndex);
  }, [messages, status, chatId, chatStore, refreshChatIndex]);

  const handleLoadChat = useCallback(
    async (id: string) => {
      const loaded = await chatStore.load(id);
      if (!loaded) return;
      setChatId(loaded.id);
      setMessages(loaded.messages);
      setAttachments([]);
      setDraft("");
    },
    [chatStore, setMessages],
  );

  const handleNewChat = useCallback(() => {
    setChatId(newChatId());
    setMessages([]);
    setAttachments([]);
    setDraft("");
  }, [setMessages]);

  const handleDeleteChat = useCallback(
    async (id: string) => {
      await chatStore.delete(id);
      if (id === chatId) handleNewChat();
      await refreshChatIndex();
    },
    [chatStore, chatId, handleNewChat, refreshChatIndex],
  );

  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      const text = message.text.trim();
      if (!text && attachments.length === 0) return;
      setErrorBanner(null);

      let userMessage: string;
      try {
        const assembled = await assemblePrompt({
          userPrompt: text,
          attachments,
          folderTree,
          listNotesInFolder: folderId =>
            alt.notes.list({ folderId, limit: 50 }),
          getNoteContent: id => alt.notes.getContent(id),
        });
        userMessage = assembled.userMessage;
      } catch (error) {
        setErrorBanner(
          error instanceof Error ? error.message : String(error),
        );
        return;
      }

      setDraft("");
      sendMessage({ text: userMessage });
    },
    [attachments, folderTree, sendMessage],
  );

  const handleTextareaChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = event.target.value;
      setDraft(value);
      const caret = event.target.selectionStart ?? value.length;
      const mention = detectMentionAtCaret(value, caret);
      setMentionQuery(mention ? mention.query : null);
    },
    [],
  );

  const filteredMentionResults = useMemo(() => {
    if (mentionQuery === null) return null;
    const query = mentionQuery.toLowerCase();
    const folderMatches = folderTree.length
      ? flattenFolders(folderTree).filter(folder =>
          folder.name.toLowerCase().includes(query),
        )
      : [];
    const noteMatches = allNotes.filter(note =>
      note.title.toLowerCase().includes(query),
    );
    return { folderMatches, noteMatches };
  }, [allNotes, folderTree, mentionQuery]);

  const handleMentionPick = useCallback(
    (attachment: Attachment) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const caret = textarea.selectionStart ?? draft.length;
      const mention = detectMentionAtCaret(draft, caret);
      if (!mention) return;
      const before = draft.slice(0, mention.triggerStart);
      const after = draft.slice(caret);
      const nextValue = `${before}${after}`;
      setDraft(nextValue);
      setMentionQuery(null);
      setAttachments(current => {
        if (
          current.some(
            existing =>
              existing.kind === attachment.kind && existing.id === attachment.id,
          )
        ) {
          return current;
        }
        return [...current, attachment];
      });
      requestAnimationFrame(() => {
        textarea.focus();
        const pos = before.length;
        textarea.setSelectionRange(pos, pos);
      });
    },
    [draft],
  );

  const handleQuizSubmit = useCallback(
    (toolCallId: string, output: QuizOutput) => {
      addToolOutput({
        tool: "createQuiz",
        toolCallId,
        output,
      });
    },
    [addToolOutput],
  );

  return (
    <div className="grid h-screen grid-cols-[18rem_1fr] bg-background text-foreground">
      <aside className="flex h-full flex-col border-r border-border/60 bg-card/40 p-3">
        <div className="flex items-center justify-between pb-2">
          <h2 className="text-sm font-semibold">Quizzes</h2>
          <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={handleNewChat}>
            <Plus className="h-3 w-3" /> New
          </Button>
        </div>
        <div className="flex-1 space-y-1 overflow-auto">
          {chatIndex.length === 0 ? (
            <p className="px-1 text-xs text-muted-foreground">
              Past quizzes will appear here.
            </p>
          ) : (
            chatIndex.map(entry => (
              <div
                key={entry.id}
                className={`group/quiz-row flex items-center gap-1 rounded-md px-2 py-1.5 text-sm ${
                  entry.id === chatId
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/60"
                }`}
              >
                <button
                  type="button"
                  onClick={() => void handleLoadChat(entry.id)}
                  className="flex-1 truncate text-left"
                >
                  {entry.title}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteChat(entry.id)}
                  className="hidden rounded p-1 text-muted-foreground hover:bg-background/60 hover:text-destructive group-hover/quiz-row:flex"
                  aria-label={`Delete ${entry.title}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      <main className="flex h-full flex-col">
        {!HOST_AVAILABLE && (
          <div className="border-b border-border/60 bg-amber-500/10 px-4 py-2 text-xs">
            Run this bundle inside Alt to enable the SDK.
          </div>
        )}
        {errorBanner && (
          <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
            {errorBanner}
          </div>
        )}

        <Conversation className="flex-1">
          <ConversationContent>
            {messages.length === 0 ? (
              <div className="mx-auto max-w-md py-16 text-center text-sm text-muted-foreground">
                <p>
                  Add files or folders you want your quiz to be generated with
                  using the <strong>Add notes</strong> button, or mention them
                  inline with <strong>@</strong>.
                </p>
                <p className="mt-2">
                  Tell the agent what to focus on, then hit send.
                </p>
              </div>
            ) : (
              messages.map(message => (
                <Message key={message.id} from={message.role}>
                  <MessageContent>
                    {message.parts.map((part, idx) => {
                      const key = `${message.id}-${idx}`;
                      if (part.type === "text") {
                        return <MessageResponse key={key}>{part.text}</MessageResponse>;
                      }
                      if (isQuizToolPart(part)) {
                        return (
                          <QuizCard
                            key={key}
                            input={part.input}
                            state={part.state as QuizCardProps["state"]}
                            output={part.output as QuizOutput | undefined}
                            errorText={part.errorText}
                            chatStatus={status}
                            onSubmit={output =>
                              handleQuizSubmit(part.toolCallId, output)
                            }
                          />
                        );
                      }
                      return null;
                    })}
                  </MessageContent>
                </Message>
              ))
            )}
            {status === "submitted" && <Loader />}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="border-t border-border/60 p-3">
          <MentionPicker
            attachments={attachments}
            folderTree={folderTree}
            allNotes={allNotes}
            onChange={setAttachments}
            onRefresh={refreshNotes}
          />

          <PromptInput
            className="mt-2"
            onSubmit={(message, event) => {
              event?.preventDefault?.();
              void handleSubmit(message);
            }}
          >
            <PromptInputBody>
              <PromptInputTextarea
                ref={textareaRef}
                value={draft}
                placeholder="Tell the agent what to focus on…"
                onChange={handleTextareaChange}
              />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                {mentionQuery !== null && filteredMentionResults && (
                  <MentionDropdown
                    query={mentionQuery}
                    folderMatches={filteredMentionResults.folderMatches}
                    noteMatches={filteredMentionResults.noteMatches}
                    onPick={handleMentionPick}
                  />
                )}
              </PromptInputTools>
              <PromptInputSubmit
                status={
                  status === "streaming"
                    ? "streaming"
                    : status === "submitted"
                      ? "submitted"
                      : "ready"
                }
                disabled={status === "streaming" || status === "submitted"}
                onClick={status === "streaming" ? () => stop() : undefined}
              />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </main>
    </div>
  );
}

function flattenFolders(
  tree: PluginFolderNode[],
): Array<PluginFolderNode & { depth: number }> {
  const out: Array<PluginFolderNode & { depth: number }> = [];
  const walk = (nodes: PluginFolderNode[], depth: number): void => {
    for (const node of nodes) {
      out.push({ ...node, depth });
      walk(node.children, depth + 1);
    }
  };
  walk(tree, 0);
  return out;
}

interface MentionDropdownProps {
  query: string;
  folderMatches: Array<PluginFolderNode & { depth: number }>;
  noteMatches: PluginNoteSummary[];
  onPick: (attachment: Attachment) => void;
}

function MentionDropdown({
  query,
  folderMatches,
  noteMatches,
  onPick,
}: MentionDropdownProps) {
  if (folderMatches.length === 0 && noteMatches.length === 0) return null;
  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 max-h-56 overflow-auto rounded-md border border-border/60 bg-popover p-1 shadow-md">
      <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        @{query}
      </p>
      {folderMatches.map(folder => (
        <button
          key={`mention-folder-${folder.id}`}
          type="button"
          onMouseDown={event => {
            event.preventDefault();
            onPick({ kind: "folder", id: folder.id, name: folder.name });
          }}
          className="block w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-accent"
        >
          📁 {folder.name}
        </button>
      ))}
      {noteMatches.map(note => (
        <button
          key={`mention-note-${note.id}`}
          type="button"
          onMouseDown={event => {
            event.preventDefault();
            onPick({ kind: "note", id: note.id, title: note.title });
          }}
          className="block w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-accent"
        >
          📄 {note.title}
        </button>
      ))}
    </div>
  );
}

type QuizCardProps = React.ComponentProps<typeof QuizCard>;
