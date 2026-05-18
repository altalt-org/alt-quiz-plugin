import { describe, expect, it } from "vitest";
import type { AltPluginApi } from "@alt/plugin-sdk";
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
