import { describe, expect, it, vi } from "vitest";
import type { UIMessage } from "ai";
import { createAltChatTransport } from "./altTransport";

describe("createAltChatTransport", () => {
  it("returns null from reconnectToStream (no resume)", async () => {
    const transport = createAltChatTransport<UIMessage>({
      createProvider: (() => ({
        languageModel: () => ({}) as never,
      })) as never,
      streamText: (() => ({ toUIMessageStream: () => new ReadableStream() })) as never,
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
});
