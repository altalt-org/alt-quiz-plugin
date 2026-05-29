import { createAltProvider } from "alt-plugin-sdk/ai";
import type { PluginAiModelId } from "alt-plugin-sdk";
import {
  convertToModelMessages,
  streamText,
  type ChatTransport,
  type UIMessage,
  type UIMessageChunk,
  type ToolSet,
} from "ai";
import type { QuizMessageMetadata } from "./types";

/**
 * If a user message carries an assembled prompt in its metadata, swap its
 * visible text for that prompt before we send the conversation to the model.
 * This lets the UI render the original short prompt + chips while still
 * giving the LLM the full note context.
 */
function expandUserMessages<UI_MESSAGE extends UIMessage>(
  messages: UI_MESSAGE[],
): UI_MESSAGE[] {
  return messages.map(message => {
    if (message.role !== "user") return message;
    const metadata = message.metadata as QuizMessageMetadata | undefined;
    const fullPrompt = metadata?.fullPrompt;
    if (!fullPrompt) return message;
    const nonTextParts = message.parts.filter(part => part.type !== "text");
    return {
      ...message,
      parts: [{ type: "text", text: fullPrompt }, ...nonTextParts],
    } as UI_MESSAGE;
  });
}

export interface AltTransportOptions {
  /** Static model; ignored if `getModel` is provided. */
  model?: PluginAiModelId;
  /** Read the current model dynamically on every send. Wins over `model`. */
  getModel?: () => PluginAiModelId;
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
  const runStream = options.streamText ?? streamText;
  const createProvider = options.createProvider ?? createAltProvider;
  const resolveModel = (): PluginAiModelId =>
    options.getModel ? options.getModel() : (options.model ?? "auto");

  return {
    async sendMessages({ messages, abortSignal }) {
      const modelId = resolveModel();
      const provider = createProvider({ model: modelId });
      const expanded = expandUserMessages(messages);
      // `ignoreIncompleteToolCalls: true` drops tool parts still in the
      // `input-streaming` / `input-available` states. This handles the case
      // where the user generated a quiz, did not click Submit, and then asked
      // for a different quiz — without this filter the prior assistant turn
      // carries a dangling tool_call and the provider rejects the request
      // with `AI_MissingToolResultsError`.
      const modelMessages = await convertToModelMessages(expanded, {
        ignoreIncompleteToolCalls: true,
      });
      const result = runStream({
        model: provider.languageModel(modelId),
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
