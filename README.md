# Alt Quiz Generator Plugin

AI-powered quiz generator for [Alt](https://altalt.io). The plugin reads notes you tag from inside the chat, calls a `createQuiz` tool, renders the questions as an interactive form, and grades your answers when you submit them.

## What it does

- Chat UI built with [AI Elements](https://elements.ai-sdk.dev/) and `@ai-sdk/react`.
- `+ Add notes` button opens a searchable folder/note tree. `@` inline mentions work the same way (model after VS Code, Codex, t3.chat).
- On send, attached notes are expanded (folders → notes), each note's transcript + memo + summary are pulled via the new `alt.notes.getContent` SDK method, and the result is bundled into one prompt.
- The agent picks the right mix of question types (multiple choice / true-false / fill-in-the-blank / short answer) and calls `createQuiz` exactly once.
- Submit is disabled until generation finishes. When you submit, your answers go back as the tool result and the agent grades them in the next turn.
- Chat history is persisted via `alt.storage` and listed in the sidebar.

## Required SDK version

`@alt/plugin-sdk@^0.2.0` — earlier versions don't expose `alt.notes.*` or the `notes:read` permission.

## Permissions

- `ai:chat` — talk to Alt's cloud LLM proxy.
- `notes:read` — list folders/notes and read the active note's transcript + memo + summary.
- `storage` — persist chat history.

## Develop

```bash
pnpm install
pnpm dev          # local preview (window.alt is missing, SDK calls error)
pnpm test         # vitest run
pnpm typecheck
pnpm build        # dist/
pnpm package      # release/io.altalt.quiz-generator-<version>.zip
```

Inside Alt, use **Plugins → Add Plugin** and pick either the `dist/` folder or the `release/<id>-<version>.zip` file produced by `pnpm package`.

## Architecture

```
src/
├── App.tsx                 # chat surface (sidebar + Conversation + PromptInput)
├── components/
│   ├── MentionPicker.tsx   # + button popover + chips + @ inline detector
│   └── QuizCard.tsx        # interactive quiz renderer + addToolOutput
└── quiz/
    ├── types.ts            # zod schemas for input/output + Attachment
    ├── quizTool.ts         # AI SDK tool() definition
    ├── promptAssembly.ts   # attachment resolution + system + user prompt
    ├── altTransport.ts     # custom ChatTransport using createAltProvider
    └── chatStore.ts        # chat history persisted via alt.storage
```

The plugin runs entirely in the sandboxed plugin webview; there is no backend. AI traffic flows through `window.alt.ai.stream`, which the Alt host proxies to the cloud (or local) model.
