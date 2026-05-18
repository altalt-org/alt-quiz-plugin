import { createAltProvider } from "@alt/plugin-sdk/ai";
import type { PluginAiModelId } from "@alt/plugin-sdk";
import {
  convertToModelMessages,
  streamText,
  type ChatTransport,
  type UIMessage,
  type UIMessageChunk,
  type ToolSet,
} from "ai";

export interface AltTransportOptions {
  model?: PluginAiModelId;
  system?: string;
  tools?: ToolSet;
  /** Optional override for the AI SDK provider, useful for unit tests. */
  createProvider?: typeof createAltProvider;
  /** Optional override for streamText, useful for unit tests. */
  streamText?: typeof streamText;
}

/**
 * A custom ChatTransport that drives `useChat` entirely client-side. It runs
 * `streamText` inside the plugin webview using the openai-compatible Alt
 * provider, then converts the result into a UIMessage stream that `useChat`
 * understands. No HTTP backend required.
 */
export function createAltChatTransport<UI_MESSAGE extends UIMessage>(
  options: AltTransportOptions = {},
): ChatTransport<UI_MESSAGE> {
  const model = options.model ?? "auto";
  const provider = (options.createProvider ?? createAltProvider)({ model });
  const runStream = options.streamText ?? streamText;

  return {
    async sendMessages({ messages, abortSignal }) {
      const modelMessages = await convertToModelMessages(messages);
      const result = runStream({
        model: provider.languageModel(model),
        system: options.system,
        tools: options.tools,
        messages: modelMessages,
        abortSignal,
      });

      return result.toUIMessageStream<UI_MESSAGE>() as unknown as ReadableStream<UIMessageChunk>;
    },
    async reconnectToStream() {
      return null;
    },
  };
}
