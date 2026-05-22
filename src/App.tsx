import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  FileText,
  Folder as FolderIcon,
  MessageSquarePlus,
  Plus,
  Trash2,
} from "lucide-react";
import { alt } from "alt-plugin-sdk";
import type {
  PluginAiModelId,
  PluginAiModelInfo,
  PluginFolderNode,
  PluginNoteSummary,
} from "alt-plugin-sdk";
import { useChat } from "@ai-sdk/react";
import {
  type ToolUIPart,
  type UIMessage,
} from "ai";

import { Button } from "@/components/ui/button";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
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
  MentionAutocomplete,
  type MentionAutocompleteHandle,
} from "@/components/MentionAutocomplete";
import {
  detectMentionAtCaret,
  MentionPicker,
} from "@/components/MentionPicker";
import { ModelPicker } from "@/components/ModelPicker";
import { QuizCard } from "@/components/QuizCard";
import { SubmissionCard } from "@/components/SubmissionCard";
import { createAltChatTransport } from "@/quiz/altTransport";
import {
  ChatStore,
  deriveChatTitle,
  type ChatIndexEntry,
} from "@/quiz/chatStore";
import {
  assemblePrompt,
  formatQuizSubmission,
  QUIZ_SYSTEM_PROMPT,
} from "@/quiz/promptAssembly";
import { createQuizTool, QUIZ_TOOL_PART_TYPE } from "@/quiz/quizTool";
import {
  quizInputSchema,
  type Attachment,
  type QuizAnswer,
  type QuizMessageMetadata,
} from "@/quiz/types";

type QuizUIMessage = UIMessage<QuizMessageMetadata>;

const HOST_AVAILABLE = typeof window !== "undefined" && "alt" in window;
const CHAT_TOOLS = { createQuiz: createQuizTool };
const DEFAULT_MODEL: PluginAiModelId = "auto";

function newChatId(): string {
  return `chat-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

function isQuizToolPart(part: QuizUIMessage["parts"][number]): part is ToolUIPart {
  return part.type === QUIZ_TOOL_PART_TYPE;
}

export default function App() {
  const chatStore = useMemo(() => new ChatStore(alt.storage), []);
  const modelRef = useRef<PluginAiModelId>(DEFAULT_MODEL);
  const transport = useMemo(
    () =>
      createAltChatTransport<QuizUIMessage>({
        getModel: () => modelRef.current,
        system: QUIZ_SYSTEM_PROMPT,
        tools: CHAT_TOOLS,
      }),
    [],
  );

  const [chatId, setChatId] = useState<string>(newChatId);
  const [chatIndex, setChatIndex] = useState<ChatIndexEntry[]>([]);
  const [folderTree, setFolderTree] = useState<PluginFolderNode[]>([]);
  const [allNotes, setAllNotes] = useState<PluginNoteSummary[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [draft, setDraft] = useState("");
  const [mention, setMention] = useState<{
    triggerStart: number;
    query: string;
  } | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [models, setModels] = useState<PluginAiModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<PluginAiModelId>(
    DEFAULT_MODEL,
  );
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const autocompleteRef = useRef<MentionAutocompleteHandle | null>(null);

  const {
    messages,
    sendMessage,
    status,
    setMessages,
    stop,
  } = useChat<QuizUIMessage>({
    id: chatId,
    transport,
    onError: error => setErrorBanner(error.message),
  });

  // Keep ref in sync so the transport always reads the latest selection.
  useEffect(() => {
    modelRef.current = selectedModel;
  }, [selectedModel]);

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

  const refreshModels = useCallback(async () => {
    if (!HOST_AVAILABLE) return;
    try {
      const list = await alt.ai.models.list();
      setModels(list);
      // If our current pick isn't usable for tools, fall back.
      const chosen = list.find(m => m.id === selectedModel);
      if (!chosen || chosen.availability !== "ready" || !chosen.supportsTools) {
        const fallback = list.find(
          m => m.availability === "ready" && m.supportsTools,
        );
        if (fallback) setSelectedModel(fallback.id);
      }
    } catch (error) {
      setErrorBanner(error instanceof Error ? error.message : String(error));
    }
  }, [selectedModel]);

  useEffect(() => {
    void refreshNotes();
    void refreshChatIndex();
    void refreshModels();
  }, [refreshNotes, refreshChatIndex, refreshModels]);

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
      setMessages(loaded.messages as QuizUIMessage[]);
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

      let fullPrompt: string;
      try {
        const assembled = await assemblePrompt({
          userPrompt: text,
          attachments,
          folderTree,
          listNotesInFolder: folderId =>
            alt.notes.list({ folderId, limit: 50 }),
          getNoteContent: id => alt.notes.getContent(id),
        });
        fullPrompt = assembled.userMessage;
      } catch (error) {
        setErrorBanner(error instanceof Error ? error.message : String(error));
        return;
      }

      const visibleText = text || "(no prompt — generate a quiz from the attached notes)";
      const sentAttachments = attachments;
      setDraft("");
      setAttachments([]);
      sendMessage({
        text: visibleText,
        metadata: {
          attachments: sentAttachments,
          fullPrompt,
        },
      });
    },
    [attachments, folderTree, sendMessage],
  );

  const handleTextareaChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = event.target.value;
      setDraft(value);
      const caret = event.target.selectionStart ?? value.length;
      const match = detectMentionAtCaret(value, caret);
      setMention(match);
    },
    [],
  );

  const handleMentionPick = useCallback(
    (attachment: Attachment) => {
      const textarea = textareaRef.current;
      if (!textarea || !mention) return;
      const caret = textarea.selectionStart ?? draft.length;
      const before = draft.slice(0, mention.triggerStart);
      const after = draft.slice(caret);
      const nextValue = `${before}${after}`;
      setDraft(nextValue);
      setMention(null);
      setAttachments(current => {
        if (
          current.some(
            existing =>
              existing.kind === attachment.kind &&
              existing.id === attachment.id,
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
    [draft, mention],
  );

  const handleTextareaKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Mention autocomplete claims keys first (arrows, Enter, Tab, Esc).
      if (mention && autocompleteRef.current?.handleKeyDown(event)) {
        event.preventDefault();
        return;
      }
      // Cmd+Enter (macOS) or Ctrl+Enter (Windows/Linux) submits the chat
      // form. Plain Enter is reserved for newlines so multi-line prompts
      // don't accidentally fire mid-thought, and so IME composition (Korean,
      // Japanese, etc.) doesn't trigger a submit when confirming a word.
      if (
        event.key === "Enter" &&
        (event.metaKey || event.ctrlKey) &&
        !event.nativeEvent.isComposing
      ) {
        event.preventDefault();
        event.currentTarget.form?.requestSubmit();
      }
    },
    [mention],
  );

  const handleQuizSubmit = useCallback(
    (toolCallId: string, answers: QuizAnswer[], quizInput: unknown) => {
      // The `createQuiz` tool already self-resolved when it ran on the
      // server side, so we do NOT call `addToolOutput`. Submission is just a
      // user message: visible text "Submitted." for the chat, and a
      // model-facing payload (`metadata.fullPrompt`) that contains the
      // formatted answers the agent grades against.
      const parsed = quizInputSchema.safeParse(quizInput);
      if (!parsed.success) return;
      const quiz = parsed.data;
      const fullPrompt = formatQuizSubmission(quiz, answers);
      void sendMessage({
        text: "Submitted.",
        metadata: {
          submission: {
            quizTitle: quiz.title,
            toolCallId,
            answers,
          },
          fullPrompt,
        },
      });
    },
    [sendMessage],
  );

  const sendStatus = status === "streaming" || status === "submitted";

  return (
    <div className="grid h-screen grid-cols-[16rem_1fr] overflow-hidden bg-background text-foreground">
      <aside className="flex h-full min-h-0 flex-col border-r border-border/60 bg-card/40">
        <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
          <h2 className="text-sm font-semibold">Quiz Generator</h2>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs"
            onClick={handleNewChat}
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            New
          </Button>
        </div>
        <div className="flex-1 space-y-0.5 overflow-auto px-1.5 pb-3">
          {chatIndex.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">
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

      <main className="flex h-full min-h-0 min-w-0 flex-col">
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
          <ConversationContent className="w-full px-4">
            {messages.length === 0 ? (
              <ConversationEmptyState
                icon={<Plus className="h-6 w-6" />}
                title="Build a quiz from your notes"
                description="Use Add notes or type @ to pull in folders and notes, then describe what the agent should focus on."
              />
            ) : (
              (() => {
                // Build a map of toolCallId -> submission so each QuizCard
                // can decide whether to render in the locked "submitted"
                // view. Source of truth is the user submission message; the
                // tool result itself is just a render trigger.
                const submissionsByToolCallId = new Map<string, QuizAnswer[]>();
                for (const m of messages) {
                  const sub = m.metadata?.submission;
                  if (m.role === "user" && sub) {
                    submissionsByToolCallId.set(sub.toolCallId, sub.answers);
                  }
                }
                return messages.map(message => {
                const submission =
                  message.role === "user"
                    ? message.metadata?.submission
                    : undefined;
                if (submission) {
                  return (
                    <div
                      key={message.id}
                      className="flex justify-end"
                    >
                      <SubmissionCard
                        quizTitle={submission.quizTitle}
                        answerCount={submission.answers.length}
                      />
                    </div>
                  );
                }
                const attachmentChips =
                  message.role === "user"
                    ? message.metadata?.attachments ?? []
                    : [];
                const hasToolPart = message.parts.some(isQuizToolPart);
                return (
                  <Message key={message.id} from={message.role}>
                    <MessageContent
                      className={hasToolPart ? "w-full max-w-full" : undefined}
                    >
                      {attachmentChips.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {attachmentChips.map(att => (
                            <span
                              key={`${att.kind}:${att.id}`}
                              className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-xs"
                            >
                              {att.kind === "folder" ? (
                                <FolderIcon className="h-3 w-3" />
                              ) : (
                                <FileText className="h-3 w-3" />
                              )}
                              <span className="max-w-40 truncate">
                                {att.kind === "folder" ? att.name : att.title}
                              </span>
                            </span>
                          ))}
                        </div>
                      )}
                      {message.parts.map((part, idx) => {
                        const key = `${message.id}-${idx}`;
                        if (part.type === "text") {
                          return (
                            <MessageResponse key={key}>
                              {part.text}
                            </MessageResponse>
                          );
                        }
                        if (isQuizToolPart(part)) {
                          const submittedAnswers = submissionsByToolCallId.get(
                            part.toolCallId,
                          );
                          return (
                            <QuizCard
                              key={key}
                              input={part.input}
                              state={part.state as QuizCardProps["state"]}
                              errorText={part.errorText}
                              chatStatus={status}
                              submitted={submittedAnswers !== undefined}
                              submittedAnswers={submittedAnswers}
                              onSubmit={answers =>
                                handleQuizSubmit(
                                  part.toolCallId,
                                  answers,
                                  part.input,
                                )
                              }
                            />
                          );
                        }
                        return null;
                      })}
                    </MessageContent>
                  </Message>
                );
              });
              })()
            )}
            {status === "submitted" && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader />
                Thinking…
              </div>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="w-full px-4 pb-4">
          <PromptInput
            className="relative"
            onSubmit={(message, event) => {
              event?.preventDefault?.();
              void handleSubmit(message);
            }}
          >
            <PromptInputBody>
              <div className="w-full px-3 pt-3">
                <MentionPicker
                  attachments={attachments}
                  folderTree={folderTree}
                  allNotes={allNotes}
                  onChange={setAttachments}
                  onRefresh={refreshNotes}
                />
              </div>
              <div className="relative w-full">
                <PromptInputTextarea
                  ref={textareaRef}
                  value={draft}
                  className="w-full text-left"
                  placeholder="Ask for a quiz. Add notes with + or @, then describe what to focus on… (⌘/Ctrl + Enter to send)"
                  onChange={handleTextareaChange}
                  onKeyDown={handleTextareaKeyDown}
                />
                {mention !== null && (
                  <MentionAutocomplete
                    ref={autocompleteRef}
                    query={mention.query}
                    folderTree={folderTree}
                    allNotes={allNotes}
                    onPick={handleMentionPick}
                    onDismiss={() => setMention(null)}
                  />
                )}
              </div>
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                <ModelPicker
                  models={models}
                  value={selectedModel}
                  onChange={setSelectedModel}
                />
              </PromptInputTools>
              <PromptInputSubmit
                status={
                  status === "streaming"
                    ? "streaming"
                    : status === "submitted"
                      ? "submitted"
                      : "ready"
                }
                disabled={sendStatus}
                onClick={sendStatus ? () => stop() : undefined}
              />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </main>
    </div>
  );
}

type QuizCardProps = React.ComponentProps<typeof QuizCard>;
