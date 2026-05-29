import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { alt } from "alt-plugin-sdk";

/** UI languages this plugin ships strings for. Any other host locale → `en`. */
type Locale = "en" | "ko" | "de";

// English is the source of truth for the key set; `ko`/`de` must match it.
const en = {
  title: "Quiz Generator",
  newChat: "New",
  emptyHistory: "Past quizzes will appear here.",
  deleteChat: "Delete {title}",
  hostUnavailable: "Run this bundle inside Alt to enable the SDK.",
  emptyTitle: "Build a quiz from your notes",
  emptyDescription:
    "Use Add notes or type @ to pull in folders and notes, then describe what the agent should focus on.",
  thinking: "Thinking…",
  promptPlaceholder:
    "Ask for a quiz. Add notes with + or @, then describe what to focus on… (⌘/Ctrl + Enter to send)",
  noPromptFallback: "(no prompt — generate a quiz from the attached notes)",
  quizFailed: "Quiz failed to generate.",
  generatingQuiz: "Generating quiz…",
  questionLabel: "Q{n}.",
  typeAnswer: "Type your answer",
  shortAnswer: "Write a short answer",
  answerTrue: "True",
  answerFalse: "False",
  submittedLabel: "Submitted",
  submitAnswers: "Submit answers",
  submittedAnswerOne: "Submitted {count} answer",
  submittedAnswerOther: "Submitted {count} answers",
  modelPlaceholder: "Model",
  noModels: "No models available",
  noTools: "no tools",
  unavailable: "unavailable",
  addNotes: "Add notes",
  searchPlaceholder: "Search notes and folders…",
  noNotes: "No notes yet.",
  collapse: "Collapse",
  expand: "Expand",
  removeAttachment: "Remove {name}",
  noMatches: "No matches for {query}",
  kindFolder: "folder",
  kindNote: "note",
} as const;

type StringKey = keyof typeof en;

const strings: Record<Locale, Record<StringKey, string>> = {
  en,
  ko: {
    title: "퀴즈 생성기",
    newChat: "새로 만들기",
    emptyHistory: "이전 퀴즈가 여기에 표시됩니다.",
    deleteChat: "{title} 삭제",
    hostUnavailable: "SDK를 사용하려면 이 번들을 Alt에서 실행하세요.",
    emptyTitle: "노트로 퀴즈 만들기",
    emptyDescription:
      "노트 추가를 누르거나 @를 입력해 폴더와 노트를 가져온 다음, 에이전트가 집중할 내용을 설명하세요.",
    thinking: "생각 중…",
    promptPlaceholder:
      "퀴즈를 요청하세요. +나 @로 노트를 추가한 뒤 집중할 내용을 설명하세요… (⌘/Ctrl + Enter로 전송)",
    noPromptFallback: "(프롬프트 없음 — 첨부한 노트로 퀴즈를 생성합니다)",
    quizFailed: "퀴즈를 생성하지 못했습니다.",
    generatingQuiz: "퀴즈 생성 중…",
    questionLabel: "문제 {n}.",
    typeAnswer: "답을 입력하세요",
    shortAnswer: "간단히 답하세요",
    answerTrue: "참",
    answerFalse: "거짓",
    submittedLabel: "제출됨",
    submitAnswers: "답안 제출",
    submittedAnswerOne: "답변 {count}개 제출됨",
    submittedAnswerOther: "답변 {count}개 제출됨",
    modelPlaceholder: "모델",
    noModels: "사용 가능한 모델 없음",
    noTools: "도구 미지원",
    unavailable: "사용 불가",
    addNotes: "노트 추가",
    searchPlaceholder: "노트와 폴더 검색…",
    noNotes: "아직 노트가 없습니다.",
    collapse: "접기",
    expand: "펼치기",
    removeAttachment: "{name} 제거",
    noMatches: "{query}에 대한 검색 결과가 없습니다",
    kindFolder: "폴더",
    kindNote: "노트",
  },
  de: {
    title: "Quiz-Generator",
    newChat: "Neu",
    emptyHistory: "Frühere Quizze erscheinen hier.",
    deleteChat: "{title} löschen",
    hostUnavailable:
      "Führe dieses Bundle in Alt aus, um das SDK zu aktivieren.",
    emptyTitle: "Erstelle ein Quiz aus deinen Notizen",
    emptyDescription:
      "Nutze „Notizen hinzufügen“ oder tippe @, um Ordner und Notizen einzubinden, und beschreibe dann, worauf sich der Agent konzentrieren soll.",
    thinking: "Denkt nach…",
    promptPlaceholder:
      "Bitte um ein Quiz. Füge mit + oder @ Notizen hinzu und beschreibe den Fokus… (⌘/Strg + Enter zum Senden)",
    noPromptFallback:
      "(keine Eingabe – Quiz aus den angehängten Notizen erstellen)",
    quizFailed: "Quiz konnte nicht erstellt werden.",
    generatingQuiz: "Quiz wird erstellt…",
    questionLabel: "Frage {n}.",
    typeAnswer: "Gib deine Antwort ein",
    shortAnswer: "Schreibe eine kurze Antwort",
    answerTrue: "Wahr",
    answerFalse: "Falsch",
    submittedLabel: "Eingereicht",
    submitAnswers: "Antworten einreichen",
    submittedAnswerOne: "{count} Antwort eingereicht",
    submittedAnswerOther: "{count} Antworten eingereicht",
    modelPlaceholder: "Modell",
    noModels: "Keine Modelle verfügbar",
    noTools: "keine Tools",
    unavailable: "nicht verfügbar",
    addNotes: "Notizen hinzufügen",
    searchPlaceholder: "Notizen und Ordner suchen…",
    noNotes: "Noch keine Notizen.",
    collapse: "Einklappen",
    expand: "Ausklappen",
    removeAttachment: "{name} entfernen",
    noMatches: "Keine Treffer für {query}",
    kindFolder: "Ordner",
    kindNote: "Notiz",
  },
};

function normalize(language: unknown): Locale {
  const base = (typeof language === "string" ? language : "en").split("-")[0];
  return base === "ko" || base === "de" ? base : "en";
}

const LocaleContext = createContext<Locale>("en");

/**
 * Tracks the host's current UI language and re-renders the tree when the user
 * switches it. Mount once near the root (see `main.tsx`) so the whole app
 * shares a single host subscription.
 *
 * On alt-plugin-sdk ≥ 0.3 the body is a one-liner — `alt.locale.get()` /
 * `alt.locale.onChange()`. Here we read the underlying `settings` + `events`
 * primitives directly so the example also runs on older hosts. Requires the
 * `settings:read` and `events:subscribe` permissions.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>("en");

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => Promise<void>) | undefined;

    void alt.settings
      .get("language")
      .then(value => {
        if (active) setLocale(normalize(value));
      })
      // No host (e.g. standalone preview) — keep the default locale.
      .catch(() => undefined);

    void alt.events
      .subscribe("settingChanged", ({ key, value }) => {
        if (key === "language") setLocale(normalize(value));
      })
      .then(stop => {
        if (active) unsubscribe = stop;
        else void stop();
      })
      .catch(() => undefined);

    return () => {
      active = false;
      void unsubscribe?.();
    };
  }, []);

  return (
    <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
  );
}

type TranslateParams = Record<string, string | number>;

/** Replaces `{token}` placeholders with the matching param value. */
function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (token, key) =>
    key in params ? String(params[key]) : token,
  );
}

/** Returns a translate function bound to the host's current language. */
export function useT(): (key: StringKey, params?: TranslateParams) => string {
  const locale = useContext(LocaleContext);
  return useCallback(
    (key, params) => interpolate(strings[locale][key], params),
    [locale],
  );
}
