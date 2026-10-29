import { useEffect, useRef, useState } from "react";
import { config } from "./config";
import { login, logout, getToken, handleCallbackOnce } from "./auth";
import logo from "./assets/coresys-logo.png";
import "./App.css";

// Interface text. The French and Kiswahili wording is a draft: have a fluent
// speaker review it before going live.
const TEXT = {
  en: {
    title: "Coresys Assistant",
    welcome: "Hello! Ask me a question about Coresys Solutions.",
    placeholder: "Type your question...",
    send: "Send",
    signIn: "Sign in",
    signOut: "Sign out",
    thinking: "Thinking...",
    signInNeeded: "Please sign in to continue with this request.",
    denied: "You do not have access to this information.",
    unavailable: "The assistant is temporarily unavailable. Please try again.",
    network: "Could not reach the service. Please check your connection and try again.",
    tooLong: "Your message is too long. Please shorten it.",
    authFailed: "Sign-in failed. Please try again.",
    unexpected: "I could not verify that from the available Coresys sources.",
    language: "Language",
  },
  fr: {
    title: "Assistant Coresys",
    welcome: "Bonjour ! Posez-moi une question sur Coresys Solutions.",
    placeholder: "Saisissez votre question...",
    send: "Envoyer",
    signIn: "Se connecter",
    signOut: "Se d\u00e9connecter",
    thinking: "R\u00e9flexion...",
    signInNeeded: "Veuillez vous connecter pour continuer cette demande.",
    denied: "Vous n'avez pas acc\u00e8s \u00e0 cette information.",
    unavailable: "L'assistant est temporairement indisponible. Veuillez r\u00e9essayer.",
    network: "Impossible de joindre le service. V\u00e9rifiez votre connexion et r\u00e9essayez.",
    tooLong: "Votre message est trop long. Veuillez le raccourcir.",
    authFailed: "La connexion a \u00e9chou\u00e9. Veuillez r\u00e9essayer.",
    unexpected: "Je n'ai pas pu v\u00e9rifier cette information \u00e0 partir des sources disponibles de Coresys.",
    language: "Langue",
  },
  sw: {
    title: "Msaidizi wa Coresys",
    welcome: "Habari! Niulize swali kuhusu Coresys Solutions.",
    placeholder: "Andika swali lako...",
    send: "Tuma",
    signIn: "Ingia",
    signOut: "Toka",
    thinking: "Inafikiria...",
    signInNeeded: "Tafadhali ingia ili kuendelea na ombi hili.",
    denied: "Huna ruhusa ya kupata taarifa hii.",
    unavailable: "Msaidizi hapatikani kwa muda. Tafadhali jaribu tena.",
    network: "Imeshindwa kufikia huduma. Angalia muunganisho wako na ujaribu tena.",
    tooLong: "Ujumbe wako ni mrefu mno. Tafadhali ufupishe.",
    authFailed: "Kuingia kumeshindwa. Tafadhali jaribu tena.",
    unexpected: "Sikuweza kuthibitisha taarifa hii kutoka kwa vyanzo vilivyopo vya Coresys.",
    language: "Lugha",
  },
};

async function postJson(path, body, token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return await fetch(`${config.apiBase}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export default function App() {
  const [lang, setLang] = useState(
    TEXT[config.defaultLang] ? config.defaultLang : "en"
  );
  const t = TEXT[lang];

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const bottomRef = useRef(null);

  const addMessage = (role, text, kind) =>
    setMessages((prev) => [...prev, { role, text, kind }]);

  // Finish sign-in when Cognito sends the user back to /callback.
  useEffect(() => {
    if (window.location.pathname !== "/callback") return;
    handleCallbackOnce()
      .then(() => setSignedIn(true))
      .catch(() => addMessage("assistant", TEXT.en.authFailed, "error"))
      .finally(() => window.history.replaceState({}, "", "/"));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function send() {
    const query = input.trim();
    if (!query || busy) return;
    if (query.length > config.maxQueryLength) {
      addMessage("assistant", t.tooLong, "error");
      return;
    }

    addMessage("user", query);
    setInput("");
    setBusy(true);

    try {
      let res = await postJson("/chat", { query, lang });
      let data = await readJson(res);

      // The public route asks for sign-in when the question needs protected data.
      if (res.status === 401 && data?.sign_in_required) {
        const token = getToken();
        setSignedIn(!!token);
        if (!token) {
          addMessage("assistant", t.signInNeeded, "signin");
          return;
        }
        res = await postJson("/restricted", { query, lang }, token);
        data = await readJson(res);
      }

      if (res.status === 200) {
        const answer = data?.answer ?? data?.message ?? data?.response;
        addMessage(
          "assistant",
          typeof answer === "string" && answer.trim() ? answer : t.unexpected
        );
      } else if (res.status === 401) {
        setSignedIn(false);
        addMessage("assistant", t.signInNeeded, "signin");
      } else if (res.status === 403) {
        addMessage("assistant", t.denied, "error");
      } else if (res.status === 400) {
        addMessage("assistant", t.tooLong, "error");
      } else {
        addMessage("assistant", t.unavailable, "error");
      }
    } catch {
      // Network failure, CORS problem or timeout. Never show raw error details.
      addMessage("assistant", t.network, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <header className="header">
        <h1 className="brand">Coresys Chatbot</h1>
        <div className="controls">
          <label className="lang">
            <span className="sr-only">{t.language}</span>
            <select value={lang} onChange={(e) => setLang(e.target.value)}>
              <option value="en">English</option>
              <option value="sw">Kiswahili</option>
              <option value="fr">Français</option>
            </select>
          </label>
          {signedIn ? (
            <button className="secondary" onClick={logout}>
              {t.signOut}
            </button>
          ) : (
            <button className="secondary" onClick={login}>
              {t.signIn}
            </button>
          )}
        </div>
      </header>

      <div className="chat-area">
      <div
        className="watermark"
        aria-hidden="true"
        style={{ backgroundImage: `url(${logo})` }}
      />
      <main className="messages" aria-live="polite">
        <div className="bubble assistant">{t.welcome}</div>
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role} ${m.kind || ""}`}>
            {m.text}
            {m.kind === "signin" && (
              <div>
                <button className="inline" onClick={login}>
                  {t.signIn}
                </button>
              </div>
            )}
          </div>
        ))}
        {busy && <div className="bubble assistant muted">{t.thinking}</div>}
        <div ref={bottomRef} />
      </main>
      </div>

      <div className="composer">
        <input
          type="text"
          value={input}
          placeholder={t.placeholder}
          maxLength={config.maxQueryLength}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          disabled={busy}
        />
        <button onClick={send} disabled={busy || !input.trim()}>
          {t.send}
        </button>
      </div>
    </div>
  );
}