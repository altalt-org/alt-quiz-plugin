import type { AltPluginApi } from "alt-plugin-sdk";
import type { UIMessage } from "ai";

export const CHAT_INDEX_KEY = "chats:index";
export const chatKey = (id: string): string => `chats:${id}`;

export interface ChatIndexEntry {
  id: string;
  title: string;
  updatedAt: string;
}

export interface StoredChat {
  id: string;
  title: string;
  messages: UIMessage[];
  createdAt: string;
  updatedAt: string;
}

type ChatStorage = AltPluginApi["storage"];

function asIndex(value: unknown): ChatIndexEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is ChatIndexEntry =>
      !!entry &&
      typeof entry === "object" &&
      typeof (entry as ChatIndexEntry).id === "string" &&
      typeof (entry as ChatIndexEntry).title === "string" &&
      typeof (entry as ChatIndexEntry).updatedAt === "string",
  );
}

function asStoredChat(value: unknown): StoredChat | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<StoredChat>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.title !== "string" ||
    !Array.isArray(candidate.messages) ||
    typeof candidate.createdAt !== "string" ||
    typeof candidate.updatedAt !== "string"
  ) {
    return null;
  }
  return candidate as StoredChat;
}

// The plugin SDK's storage accepts only plain JSON values. AI SDK's UIMessage
// parts carry many optional fields (errorText, providerExecuted, preliminary,
// …) that are routinely set to `undefined`, which Electron IPC preserves and
// the Zod validator on the host rejects. Round-tripping through JSON drops
// those properties (and any Date/function values) before the IPC boundary.
function toJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class ChatStore {
  private readonly storage: ChatStorage;

  constructor(storage: ChatStorage) {
    this.storage = storage;
  }

  async list(): Promise<ChatIndexEntry[]> {
    const raw = await this.storage.get(CHAT_INDEX_KEY);
    return asIndex(raw).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  async load(id: string): Promise<StoredChat | null> {
    const raw = await this.storage.get(chatKey(id));
    return asStoredChat(raw);
  }

  async save(chat: StoredChat): Promise<void> {
    const next: StoredChat = toJsonValue({
      ...chat,
      messages: chat.messages.slice(-200),
    });
    await this.storage.set(chatKey(chat.id), next as never);
    const index = await this.list();
    const without = index.filter(entry => entry.id !== chat.id);
    const updatedIndex = toJsonValue([
      { id: chat.id, title: chat.title, updatedAt: chat.updatedAt },
      ...without,
    ]);
    await this.storage.set(CHAT_INDEX_KEY, updatedIndex as never);
  }

  async delete(id: string): Promise<void> {
    await this.storage.delete(chatKey(id));
    const index = await this.list();
    await this.storage.set(
      CHAT_INDEX_KEY,
      toJsonValue(index.filter(entry => entry.id !== id)) as never,
    );
  }
}

export function deriveChatTitle(messages: UIMessage[]): string {
  for (const message of messages) {
    if (message.role !== "user") continue;
    for (const part of message.parts) {
      if (part.type === "text" && part.text.trim()) {
        const firstLine = part.text.trim().split(/\n/)[0];
        return firstLine.slice(0, 60);
      }
    }
  }
  return "New quiz";
}
