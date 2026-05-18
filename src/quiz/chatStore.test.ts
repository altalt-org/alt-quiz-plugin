import { describe, expect, it } from "vitest";
import type { AltPluginApi } from "@alt/plugin-sdk";
import { pluginStorageValueSchema } from "@alt/plugin-sdk";
import type { UIMessage } from "ai";
import {
  ChatStore,
  CHAT_INDEX_KEY,
  chatKey,
  deriveChatTitle,
} from "./chatStore";

function inMemoryStorage(): AltPluginApi["storage"] {
  const data = new Map<string, unknown>();
  return {
    get: async key => (data.has(key) ? (data.get(key) as never) : undefined),
    set: async (key, value) => {
      data.set(key, value);
    },
    delete: async key => {
      data.delete(key);
    },
    list: async () => Object.fromEntries(data.entries()) as never,
  };
}

// Mirrors what the plugin host does on the other side of IPC: validates every
// stored value against the strict JSON-value schema. If we ever pass an object
// containing `undefined` properties (which Electron IPC preserves), parse()
// will throw — exactly like the real host did.
function strictStorage(): AltPluginApi["storage"] {
  const data = new Map<string, unknown>();
  return {
    get: async key => (data.has(key) ? (data.get(key) as never) : undefined),
    set: async (key, value) => {
      pluginStorageValueSchema.parse(value);
      data.set(key, value);
    },
    delete: async key => {
      data.delete(key);
    },
    list: async () => Object.fromEntries(data.entries()) as never,
  };
}

const userText = (text: string): UIMessage =>
  ({
    id: text,
    role: "user",
    parts: [{ type: "text", text }],
  }) as UIMessage;

describe("ChatStore", () => {
  it("round-trips a chat and indexes it", async () => {
    const storage = inMemoryStorage();
    const store = new ChatStore(storage);

    await store.save({
      id: "chat-1",
      title: "First chat",
      messages: [userText("hello")],
      createdAt: "2026-05-15T00:00:00.000Z",
      updatedAt: "2026-05-15T00:00:00.000Z",
    });

    const loaded = await store.load("chat-1");
    expect(loaded?.title).toBe("First chat");
    expect(await storage.get(CHAT_INDEX_KEY)).toEqual([
      expect.objectContaining({ id: "chat-1" }),
    ]);
    expect(await storage.get(chatKey("chat-1"))).toMatchObject({
      title: "First chat",
    });
  });

  it("lists chats newest first", async () => {
    const store = new ChatStore(inMemoryStorage());
    await store.save({
      id: "a",
      title: "A",
      messages: [],
      createdAt: "2026-05-15T00:00:00.000Z",
      updatedAt: "2026-05-15T00:00:00.000Z",
    });
    await store.save({
      id: "b",
      title: "B",
      messages: [],
      createdAt: "2026-05-15T00:01:00.000Z",
      updatedAt: "2026-05-15T00:01:00.000Z",
    });
    const list = await store.list();
    expect(list.map(entry => entry.id)).toEqual(["b", "a"]);
  });

  it("strips undefined properties so the host's JSON-value validator accepts the payload", async () => {
    // Reproduces the production ZodError: AI SDK message parts arrive with
    // optional fields like `errorText`, `providerExecuted`, and `preliminary`
    // set to undefined. Electron IPC preserves undefined property values and
    // the host's pluginStorageValueSchema rejects them.
    const storage = strictStorage();
    const store = new ChatStore(storage);
    const messageWithUndefinedFields = {
      id: "m1",
      role: "assistant",
      parts: [
        {
          type: "text",
          text: "hi",
          errorText: undefined,
          providerExecuted: undefined,
          preliminary: undefined,
        },
      ],
    } as unknown as UIMessage;

    await expect(
      store.save({
        id: "chat-undef",
        title: "t",
        messages: [messageWithUndefinedFields],
        createdAt: "2026-05-15T00:00:00.000Z",
        updatedAt: "2026-05-15T00:00:00.000Z",
      }),
    ).resolves.toBeUndefined();
  });

  it("delete removes both the entry and the index reference", async () => {
    const store = new ChatStore(inMemoryStorage());
    await store.save({
      id: "x",
      title: "X",
      messages: [],
      createdAt: "2026-05-15T00:00:00.000Z",
      updatedAt: "2026-05-15T00:00:00.000Z",
    });
    await store.delete("x");
    expect(await store.load("x")).toBeNull();
    expect(await store.list()).toEqual([]);
  });
});

describe("deriveChatTitle", () => {
  it("uses the first non-empty user text", () => {
    expect(deriveChatTitle([userText(" "), userText("Quiz me on calc")])).toBe(
      "Quiz me on calc",
    );
  });

  it("falls back to a default", () => {
    expect(deriveChatTitle([])).toBe("New quiz");
  });

  it("trims long titles to 60 characters", () => {
    const long = "x".repeat(120);
    expect(deriveChatTitle([userText(long)]).length).toBe(60);
  });
});
