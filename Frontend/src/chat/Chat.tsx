// The Watt If assistant: a launcher button and a chat panel that streams answers from /api/chat
// (api/chat.ts). The conversation survives tab changes and reloads within the browser session.

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import type { ChatEvent } from "../../api/chat.ts";
import { parseMarkdown, type Inline } from "./markdown.ts";

interface Turn {
  role: "user" | "assistant";
  content: string;
  /** assistant turns only: still arriving, or how it ended when not normally */
  state?: "streaming" | "stopped" | "truncated" | "refused" | "error";
}

const STORE_KEY = "fw-chat";
const MAX_INPUT = 2000; // api/chat.ts LIMITS.userChars

const GENERAL = [
  "What does basic service cost right now?",
  "I pay 14.9¢/kWh to a competitive supplier. Am I saving money?",
  "How much electricity does a typical Massachusetts home use?",
];

const BY_PAGE: Record<string, string> = {
  overview: "How have electricity prices changed since 2010?",
  usage: "We use about 8,000 kWh a year. How does that compare?",
  prices: GENERAL[1],
  grid: "What does “Above range” mean?",
  climate: "Is it better to buy solar now or wait?",
  towns: "Which load zone is Worcester in?",
  sources: "Where does this site's data come from?",
  about: "Who builds Watt If?",
};

function suggestionsFor(page: string): string[] {
  const first = BY_PAGE[page];
  return first ? [first, ...GENERAL.filter((q) => q !== first)].slice(0, 3) : GENERAL;
}

function loadTurns(): Turn[] {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(STORE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t): t is Turn => (t?.role === "user" || t?.role === "assistant") && typeof t.content === "string");
  } catch {
    return [];
  }
}

function saveTurns(turns: Turn[]): void {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(turns.filter((t) => t.state !== "streaming" && t.state !== "error")));
  } catch {
    /* storage unavailable: the chat still works for this page view */
  }
}

/** What the model sees: the visitor's questions and the answers that actually arrived. */
function history(turns: Turn[]): { role: Turn["role"]; content: string }[] {
  return turns.filter((t) => t.content.trim() && t.state !== "error" && t.state !== "refused" && t.state !== "streaming").map(({ role, content }) => ({ role, content }));
}

async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<ChatEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    for (let nl = buffer.indexOf("\n"); nl >= 0; nl = buffer.indexOf("\n")) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) yield JSON.parse(line) as ChatEvent;
    }
  }
}

function renderInline(nodes: Inline[], onNavigate: () => void): ReactNode[] {
  return nodes.map((n, i) => {
    switch (n.type) {
      case "text":
        return <Fragment key={i}>{n.text}</Fragment>;
      case "strong":
        return <strong key={i}>{renderInline(n.children, onNavigate)}</strong>;
      case "em":
        return <em key={i}>{renderInline(n.children, onNavigate)}</em>;
      case "code":
        return (
          <code key={i} className="code">
            {n.text}
          </code>
        );
      case "link":
        return n.href.startsWith("#") ? (
          <a key={i} href={n.href} onClick={onNavigate}>
            {renderInline(n.children, onNavigate)}
          </a>
        ) : (
          <a key={i} href={n.href} target="_blank" rel="noopener noreferrer">
            {renderInline(n.children, onNavigate)}
          </a>
        );
    }
  });
}

function Markdown({ text, onNavigate }: { text: string; onNavigate: () => void }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return (
    <>
      {blocks.map((b, i) => {
        if (b.type === "p" || b.type === "heading")
          return (
            <p key={i} className={b.type === "heading" ? "chat-heading" : undefined}>
              {renderInline(b.children, onNavigate)}
            </p>
          );
        if (b.type === "table")
          return (
            <div key={i} className="chat-table">
              <table>
                <thead>
                  <tr>
                    {b.head.map((c, j) => (
                      <th key={j}>{renderInline(c, onNavigate)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((r, j) => (
                    <tr key={j}>
                      {r.map((c, k) => (
                        <td key={k}>{renderInline(c, onNavigate)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        const List = b.type;
        return (
          <List key={i}>
            {b.items.map((item, j) => (
              <li key={j}>{renderInline(item, onNavigate)}</li>
            ))}
          </List>
        );
      })}
    </>
  );
}

function ChatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 3.5h12A1.5 1.5 0 0 1 17.5 5v8a1.5 1.5 0 0 1-1.5 1.5H9l-4 3v-3H4A1.5 1.5 0 0 1 2.5 13V5A1.5 1.5 0 0 1 4 3.5z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M11 6.5 8 10.5h2.5l-1 3 3-4H10z" fill="currentColor" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

const ENDINGS: Partial<Record<NonNullable<Turn["state"]>, string>> = {
  stopped: "Stopped.",
  truncated: "That answer was cut short. Ask a follow-up to continue.",
};

const REFUSED = "I can't help with that one. Ask me about Massachusetts electricity prices, basic service, home energy use or anything on this dashboard.";

export function Chat({ page }: { page: string }) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>(loadTurns);
  const [draft, setDraft] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const stickRef = useRef(true);
  const wasOpen = useRef(false);
  /** bumped by each send and by "New chat", so a superseded stream can't write into the chat */
  const runRef = useRef(0);
  const busy = turns[turns.length - 1]?.state === "streaming";

  useEffect(() => saveTurns(turns), [turns]);
  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else if (wasOpen.current) launcherRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  // Follow the answer as it streams, unless the visitor has scrolled up to read.
  useLayoutEffect(() => {
    const log = logRef.current;
    if (log && stickRef.current) log.scrollTop = log.scrollHeight;
  }, [turns, open]);

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [draft, open]);

  const close = () => setOpen(false);

  // On a phone the panel covers the page, so following a link to a tab closes it.
  const onNavigate = () => {
    if (window.matchMedia("(max-width: 560px)").matches) setOpen(false);
  };

  async function send(text: string, base: Turn[] = turns) {
    const question = text.trim().slice(0, MAX_INPUT);
    if (!question || busy) return;
    const run = ++runRef.current;
    const asked: Turn[] = [...base, { role: "user", content: question }];
    const show = (last: Turn | null) => {
      if (runRef.current === run) setTurns(last ? [...asked, last] : asked);
    };
    show({ role: "assistant", content: "", state: "streaming" });
    setDraft("");
    stickRef.current = true;

    const controller = new AbortController();
    abortRef.current = controller;
    let answer = "";
    try {
      const res = await fetch("api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history(asked), page }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        show({ role: "assistant", content: err?.error ?? "The assistant isn't available right now.", state: "error" });
        return;
      }
      for await (const ev of readEvents(res.body)) {
        if (ev.type === "text") {
          answer += ev.text;
          show({ role: "assistant", content: answer, state: "streaming" });
        } else if (ev.type === "done") {
          show(answer ? { role: "assistant", content: answer, state: ev.truncated ? "truncated" : undefined } : { role: "assistant", content: "No answer came back. Please try again.", state: "error" });
          return;
        } else if (ev.type === "refusal") {
          show({ role: "assistant", content: REFUSED, state: "refused" });
          return;
        } else {
          show({ role: "assistant", content: ev.message, state: "error" });
          return;
        }
      }
      show(answer ? { role: "assistant", content: answer, state: "stopped" } : { role: "assistant", content: "The answer didn't arrive. Please try again.", state: "error" });
    } catch {
      if (controller.signal.aborted) show(answer ? { role: "assistant", content: answer, state: "stopped" } : null);
      else show({ role: "assistant", content: "Couldn't reach the assistant. Check your connection and try again.", state: "error" });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  const retry = () => {
    const question = turns[turns.length - 2];
    if (question?.role === "user") send(question.content, turns.slice(0, -2));
  };

  const reset = () => {
    runRef.current++;
    abortRef.current?.abort();
    setTurns([]);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(draft);
    }
  };

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        className="chat-launcher"
        aria-expanded={open}
        aria-controls="chat-panel"
        onClick={() => setOpen(true)}
        hidden={open}
      >
        <ChatIcon />
        Ask Watt If
      </button>

      {open ? (
        <section id="chat-panel" className="chat-panel" role="dialog" aria-label="Watt If assistant" onKeyDown={(e) => e.key === "Escape" && close()}>
          <header className="chat-head">
            <div>
              <h2 className="chat-title">Watt If assistant</h2>
              <p className="chat-sub">Answers from this site's Massachusetts energy data</p>
            </div>
            <div className="chat-actions">
              {turns.length ? (
                <button type="button" className="chat-text-btn" onClick={reset}>
                  New chat
                </button>
              ) : null}
              <button type="button" className="chat-icon-btn" onClick={close} aria-label="Close assistant">
                <CloseIcon />
              </button>
            </div>
          </header>

          <div
            ref={logRef}
            className="chat-log"
            role="log"
            aria-live="polite"
            aria-busy={busy}
            onScroll={(e) => {
              const el = e.currentTarget;
              stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
            }}
          >
            {turns.length === 0 ? (
              <div className="chat-empty">
                <p>
                  Hi! I can answer questions about Massachusetts electricity prices, basic service and competitive suppliers, how much homes use,
                  and anything on this dashboard.
                </p>
                <div className="chat-suggestions">
                  {suggestionsFor(page).map((q) => (
                    <button key={q} type="button" className="chat-suggestion" onClick={() => send(q)}>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              turns.map((t, i) => (
                <div key={i} className={`chat-msg chat-${t.role}${t.state === "error" ? " chat-error" : ""}`}>
                  <span className="sr-only">{t.role === "user" ? "You:" : "Assistant:"}</span>
                  {t.role === "user" ? (
                    <p>{t.content}</p>
                  ) : t.state === "streaming" && !t.content ? (
                    <span className="chat-typing" aria-label="Writing an answer">
                      <i />
                      <i />
                      <i />
                    </span>
                  ) : t.state === "error" || t.state === "refused" ? (
                    <p>{t.content}</p>
                  ) : (
                    <Markdown text={t.content} onNavigate={onNavigate} />
                  )}
                  {t.state && ENDINGS[t.state] ? <p className="chat-ending">{ENDINGS[t.state]}</p> : null}
                  {t.state === "error" && i === turns.length - 1 ? (
                    <button type="button" className="chat-text-btn" onClick={retry}>
                      Try again
                    </button>
                  ) : null}
                </div>
              ))
            )}
          </div>

          <form
            className="chat-form"
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
          >
            <label htmlFor="chat-input" className="sr-only">
              Ask a question
            </label>
            <textarea
              id="chat-input"
              ref={inputRef}
              className="input chat-input"
              rows={1}
              maxLength={MAX_INPUT}
              placeholder="Ask about rates, usage, savings…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
            />
            {busy ? (
              <button type="button" className="chat-send" onClick={() => abortRef.current?.abort()}>
                Stop
              </button>
            ) : (
              <button type="submit" className="chat-send" disabled={!draft.trim()}>
                Send
              </button>
            )}
          </form>
          <p className="chat-note">
            AI answers from this site's data, powered by Google Gemini. They can be wrong, so check key figures on the dashboard. Questions are sent to
            Google, which may use them to improve its products: please don't share account numbers or other personal details.
          </p>
        </section>
      ) : null}
    </>
  );
}
