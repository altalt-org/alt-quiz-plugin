import { describe, expect, it, vi } from "vitest";
import type { UIMessage } from "ai";
import { createAltChatTransport } from "./altTransport";

describe("createAltChatTransport", () => {
  it("returns null from reconnectToStream (no resume)", async () => {
    const transport = createAltChatTransport<UIMessage>({
      createProvider: (() => ({
        languageModel: () => ({}) as never,
      })) as never,
      streamText: (() => ({
        toUIMessageStream: () => new ReadableStream(),
      })) as never,
    });
    await expect(
      transport.reconnectToStream({ chatId: "anything" }),
    ).resolves.toBeNull();
  });

  it("passes converted model messages and tools to streamText", async () => {
    const streamText = vi.fn(() => ({
      toUIMessageStream: () => new ReadableStream(),
    }));
    const provider = { languageModel: vi.fn(() => "lm") };
    const transport = createAltChatTransport<UIMessage>({
      createProvider: (() => provider) as never,
      streamText: streamText as never,
      system: "you are a quizmaker",
      tools: { createQuiz: { description: "fake" } as never },
    });

    await transport.sendMessages({
      messages: [
        {
          id: "u1",
          role: "user",
          parts: [{ type: "text", text: "make me a quiz" }],
        } as UIMessage,
      ],
      abortSignal: undefined,
      chatId: "chat-1",
      messageId: undefined,
      trigger: "submit-message",
    });

    expect(provider.languageModel).toHaveBeenCalledWith("auto");
    expect(streamText).toHaveBeenCalledTimes(1);
    const args = streamText.mock.calls[0][0] as Record<string, unknown>;
    expect(args.system).toBe("you are a quizmaker");
    expect((args.tools as Record<string, unknown>).createQuiz).toBeDefined();
    expect(Array.isArray(args.messages)).toBe(true);
  });

  it("swaps the user text for metadata.fullPrompt before sending to the model", async () => {
    const streamText = vi.fn(() => ({
      toUIMessageStream: () => new ReadableStream(),
    }));
    const transport = createAltChatTransport<UIMessage>({
      createProvider: (() => ({
        languageModel: () => "lm",
      })) as never,
      streamText: streamText as never,
    });

    await transport.sendMessages({
      messages: [
        {
          id: "u1",
          role: "user",
          parts: [{ type: "text", text: "short prompt" }],
          metadata: {
            attachments: [{ kind: "note", id: 1, title: "n" }],
            fullPrompt: "EXPANDED PROMPT WITH NOTES",
          },
        } as UIMessage,
      ],
      abortSignal: undefined,
      chatId: "chat-1",
      messageId: undefined,
      trigger: "submit-message",
    });

    const args = streamText.mock.calls[0][0] as { messages: unknown[] };
    const firstMsg = args.messages[0] as {
      role: string;
      content: Array<{ type: string; text: string }>;
    };
    expect(firstMsg.role).toBe("user");
    const textPart = firstMsg.content.find(c => c.type === "text");
    expect(textPart?.text).toBe("EXPANDED PROMPT WITH NOTES");
  });

  it("drops unresolved tool calls so the model never sees a dangling tool_call", async () => {
    // Repro: user generated a quiz, did not click Submit, then asked for a
    // different quiz. The previous assistant message holds a
    // `tool-createQuiz` part in `input-available` (no tool result yet).
    // Without filtering, streamText would throw AI_MissingToolResultsError.
    const streamText = vi.fn(() => ({
      toUIMessageStream: () => new ReadableStream(),
    }));
    const transport = createAltChatTransport<UIMessage>({
      createProvider: (() => ({
        languageModel: () => "lm",
      })) as never,
      streamText: streamText as never,
    });

    await transport.sendMessages({
      messages: [
        {
          id: "u1",
          role: "user",
          parts: [{ type: "text", text: "first ask" }],
        } as UIMessage,
        {
          id: "a1",
          role: "assistant",
          parts: [
            {
              type: "tool-createQuiz",
              toolCallId: "call_dangling",
              state: "input-available",
              input: { title: "Q", questions: [] },
            },
          ],
        } as unknown as UIMessage,
        {
          id: "u2",
          role: "user",
          parts: [{ type: "text", text: "different ask" }],
        } as UIMessage,
      ],
      abortSignal: undefined,
      chatId: "chat-1",
      messageId: undefined,
      trigger: "submit-message",
    });

    expect(streamText).toHaveBeenCalledTimes(1);
    const args = streamText.mock.calls[0][0] as {
      messages: Array<{
        role: string;
        content: Array<{ type: string; toolCallId?: string }>;
      }>;
    };
    const allParts = args.messages.flatMap(m => m.content);
    const danglingCall = allParts.find(
      part => part.type === "tool-call" && part.toolCallId === "call_dangling",
    );
    expect(danglingCall).toBeUndefined();
  });
});
