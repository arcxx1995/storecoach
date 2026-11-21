"use client";
import { useEffect, useState } from "react";

// Global English / local-language switch. The cookie lets the layout set <html data-lang> on first paint;
// CSS (.t-en / .t-local) does the swap, so pages need no client state.
export function LangSwitch() {
  const [lang, setLang] = useState("en");
  useEffect(() => setLang(document.documentElement.dataset.lang ?? "en"), []);
  const pick = (v: string) => {
    document.cookie = `lang=${v}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.dataset.lang = v;
    setLang(v);
  };
  return (
    <div className="langsw" role="group" aria-label="Card language">
      <button type="button" aria-pressed={lang === "en"} onClick={() => pick("en")}>English</button>
      <button type="button" aria-pressed={lang === "local"} onClick={() => pick("local")}>हिंदी / ಕನ್ನಡ</button>
    </div>
  );
}
