import { useEffect, useState } from "react";
import { alt } from "alt-plugin-sdk";

/** UI languages this plugin ships strings for. Any other host locale → `en`. */
type Locale = "en" | "ko" | "de";

const strings = {
  en: {
    title: "Quiz Generator",
    emptyHistory: "Past quizzes will appear here.",
  },
  ko: {
    title: "퀴즈 생성기",
    emptyHistory: "이전 퀴즈가 여기에 표시됩니다.",
  },
  de: {
    title: "Quiz-Generator",
    emptyHistory: "Frühere Quizze erscheinen hier.",
  },
} as const;

type StringKey = keyof (typeof strings)["en"];

function normalize(language: unknown): Locale {
  const base = (typeof language === "string" ? language : "en").split("-")[0];
  return base === "ko" || base === "de" ? base : "en";
}

/**
 * Track the host's current UI language and re-render when the user switches it.
 *
 * On alt-plugin-sdk ≥ 0.3 this is a one-liner — `alt.locale.get()` /
 * `alt.locale.onChange()`. Here we read the underlying `settings` + `events`
 * primitives directly so the example also runs on older hosts. Requires the
 * `settings:read` and `events:subscribe` permissions.
 */
export function useLocale(): Locale {
  const [locale, setLocale] = useState<Locale>("en");

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => Promise<void>) | undefined;

    void alt.settings
      .get("language")
      .then((value) => {
        if (active) setLocale(normalize(value));
      })
      // No host (e.g. standalone preview) — keep the default locale.
      .catch(() => undefined);

    void alt.events
      .subscribe("settingChanged", ({ key, value }) => {
        if (key === "language") setLocale(normalize(value));
      })
      .then((stop) => {
        if (active) unsubscribe = stop;
        else void stop();
      })
      .catch(() => undefined);

    return () => {
      active = false;
      void unsubscribe?.();
    };
  }, []);

  return locale;
}

/** Returns a translate function bound to the host's current language. */
export function useT(): (key: StringKey) => string {
  const locale = useLocale();
  return (key) => strings[locale][key];
}
