// The chat endpoint (api/chat.ts) against a fake SDK client: request validation, the request it
// sends to Gemini, and the NDJSON stream it returns. No network and no API key needed.

import assert from "node:assert/strict";
import { test } from "node:test";

import { ApiError } from "@google/genai";

import { LIMITS, POST, handleChat, parseChatRequest, rateLimited, type ChatClient, type ChatEvent } from "../../api/chat.ts";
import { KNOWLEDGE } from "../../server/knowledge.ts";

type Params = {
  model: string;
  contents: { role: string; parts: { text: string }[] }[];
  config: Record<string, unknown> & { systemInstruction: string };
};

/**
 * A client whose stream yields `deltas` as text chunks, the last one carrying `finish`; `fail`
 * is thrown after the deltas, or before any when `failEarly` (as an HTTP error would be).
 */
function fakeClient(deltas: string[], finish = "STOP", fail?: Error, failEarly = false) {
  const calls: Params[] = [];
  const client = {
    models: {
      async generateContentStream(params: Params) {
        calls.push(params);
        if (fail && failEarly) throw fail;
        return (async function* () {
          for (const [i, text] of deltas.entries()) {
            const last = i === deltas.length - 1;
            yield { text, candidates: [last ? { finishReason: finish } : {}], modelVersion: "gemini-test", usageMetadata: last ? { promptTokenCount: 10, candidatesTokenCount: 5 } : undefined };
          }
          if (fail) throw fail;
        })();
      },
    },
  };
  return { client: client as unknown as ChatClient, calls };
}

/** A client that yields `deltas`, then stalls until its abort signal fires, as a hung API call would. */
function stalledClient(deltas: string[]): ChatClient {
  const client = {
    models: {
      async generateContentStream(params: Params) {
        const signal = params.config.abortSignal as AbortSignal;
        const stalled = new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
        if (deltas.length === 0) await stalled;
        return (async function* () {
          for (const text of deltas) yield { text, candidates: [{}] };
          await stalled;
        })();
      },
    },
  };
  return client as unknown as ChatClient;
}

let ip = 0;
function post(body: unknown): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": `10.0.0.${++ip}` },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function events(res: Response): Promise<ChatEvent[]> {
  return (await res.text())
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as ChatEvent);
}

const ask = (content: string) => ({ messages: [{ role: "user", content }] });

test("parseChatRequest validates turns and keeps the newest ones", () => {
  assert.deepEqual(parseChatRequest({ messages: [{ role: "user", content: "hi" }], page: "prices" }), { turns: [{ role: "user", content: "hi" }], page: "prices" });
  assert.equal((parseChatRequest({ messages: [{ role: "user", content: "hi" }], page: "constructor" }) as { page: string | null }).page, null);
  for (const bad of [null, {}, { messages: [] }, { messages: [{ role: "system", content: "x" }] }, { messages: [{ role: "user", content: "  " }] }, { messages: [{ role: "user", content: "a" }, { role: "assistant", content: "b" }] }, ask("x".repeat(LIMITS.userChars + 1))]) {
    assert.ok("error" in parseChatRequest(bad), JSON.stringify(bad)?.slice(0, 60));
  }
  const long = Array.from({ length: 41 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `m${i}` }));
  const r = parseChatRequest({ messages: long }) as { turns: { role: string; content: string }[] };
  assert.ok(r.turns.length <= LIMITS.turns);
  assert.equal(r.turns[0].role, "user");
  assert.equal(r.turns[r.turns.length - 1].content, "m40");
});

test("handleChat sends the knowledge base and streams the answer", async () => {
  const { client, calls } = fakeClient(["Basic service ", "is 17.185¢."]);
  const res = await handleChat(post({ ...ask("What does basic service cost?"), page: "prices" }), client, new Date("2026-10-24T12:00:00Z"));
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /ndjson/);
  assert.deepEqual(await events(res), [
    { type: "text", text: "Basic service " },
    { type: "text", text: "is 17.185¢." },
    { type: "done", truncated: false },
  ]);
  const p = calls[0];
  assert.equal(p.model, "gemini-flash-lite-latest");
  assert.equal(p.config.maxOutputTokens, 8000);
  assert.equal(p.config.thinkingConfig, undefined);
  assert.ok(p.config.abortSignal instanceof AbortSignal);
  // shared prefix first (instructions, then the knowledge base), per-request context last
  const sys = p.config.systemInstruction;
  assert.ok(sys.startsWith("You are the assistant on Watt If"));
  assert.ok(sys.includes(`\n\n${KNOWLEDGE}\n\n# This conversation`));
  assert.ok(sys.endsWith("Today's date is 2026-10-24. The visitor is on the Prices & savings tab (#/prices)."));
  assert.deepEqual(p.contents, [{ role: "user", parts: [{ text: "What does basic service cost?" }] }]);
});

test("handleChat maps roles to Gemini's and joins consecutive turns", async () => {
  const { client, calls } = fakeClient(["ok"]);
  const turns = [
    { role: "user", content: "a" },
    { role: "assistant", content: "b" },
    { role: "user", content: "c" },
    { role: "user", content: "d" },
  ];
  await events(await handleChat(post({ messages: turns }), client));
  assert.deepEqual(calls[0].contents, [
    { role: "user", parts: [{ text: "a" }] },
    { role: "model", parts: [{ text: "b" }] },
    { role: "user", parts: [{ text: "c\n\nd" }] },
  ]);
});

test("handleChat reports truncation, refusals and API failures in the stream", async () => {
  assert.deepEqual((await events(await handleChat(post(ask("q")), fakeClient(["a"], "MAX_TOKENS").client))).at(-1), { type: "done", truncated: true });
  assert.deepEqual((await events(await handleChat(post(ask("q")), fakeClient(["a"], "SAFETY").client))).at(-1), { type: "refusal" });
  const original = console.error;
  console.error = () => {};
  try {
    const quota = new ApiError({ message: "RESOURCE_EXHAUSTED", status: 429 });
    const out = await events(await handleChat(post(ask("q")), fakeClient(["par"], "STOP", quota).client));
    assert.deepEqual(out, [{ type: "text", text: "par" }, { type: "error", message: "The assistant is busy right now. Please try again in a minute." }]);
    const badKey = new ApiError({ message: "API key not valid", status: 400 });
    assert.deepEqual(await events(await handleChat(post(ask("q")), fakeClient([], "STOP", badKey, true).client)), [{ type: "error", message: "The assistant isn't available right now." }]);
    const offline = await events(await handleChat(post(ask("q")), fakeClient([], "STOP", new TypeError("fetch failed"), true).client));
    assert.deepEqual(offline, [{ type: "error", message: "The assistant couldn't be reached. Please try again." }]);
  } finally {
    console.error = original;
  }
});

test("handleChat ends a stalled answer before the function's time limit", async () => {
  const saved = LIMITS.answerMs;
  LIMITS.answerMs = 20;
  const original = console.error;
  console.error = () => {};
  try {
    assert.deepEqual(await events(await handleChat(post(ask("q")), stalledClient([]))), [{ type: "error", message: "The assistant took too long to answer. Please try again." }]);
    assert.deepEqual(await events(await handleChat(post(ask("q")), stalledClient(["Basic service "]))), [
      { type: "text", text: "Basic service " },
      { type: "done", truncated: true },
    ]);
  } finally {
    console.error = original;
    LIMITS.answerMs = saved;
  }
});

test("handleChat sends an overloaded model's error after one attempt", async () => {
  const original = console.error;
  console.error = () => {};
  try {
    const overloaded = new ApiError({ message: "UNAVAILABLE", status: 503 });
    const { client, calls } = fakeClient([], "STOP", overloaded, true);
    assert.deepEqual(await events(await handleChat(post(ask("q")), client)), [{ type: "error", message: "The assistant is busy right now. Please try again in a minute." }]);
    assert.equal(calls.length, 1);
  } finally {
    console.error = original;
  }
});

test("handleChat rejects bad bodies before calling the API", async () => {
  const { client, calls } = fakeClient(["x"]);
  assert.equal((await handleChat(post("not json"), client)).status, 400);
  assert.equal((await handleChat(post({ messages: [] }), client)).status, 400);
  assert.equal((await handleChat(post("x".repeat(LIMITS.bodyChars + 1)), client)).status, 413);
  assert.equal(calls.length, 0);
});

test("rateLimited allows a burst per key, then blocks until the window passes", () => {
  const t0 = 1_000_000;
  for (let i = 0; i < LIMITS.requestsPerWindow; i++) assert.equal(rateLimited("k", t0 + i), false);
  assert.equal(rateLimited("k", t0 + 100), true);
  assert.equal(rateLimited("other", t0 + 100), false);
  assert.equal(rateLimited("k", t0 + LIMITS.windowMs + 50), false);
});

test("handleChat returns 429 once a client IP is over the limit", async () => {
  const { client } = fakeClient(["ok"]);
  const from = (addr: string) => new Request("http://localhost/api/chat", { method: "POST", headers: { "x-real-ip": addr }, body: JSON.stringify(ask("q")) });
  for (let i = 0; i < LIMITS.requestsPerWindow; i++) assert.equal((await handleChat(from("192.0.2.1"), client)).status, 200);
  const res = await handleChat(from("192.0.2.1"), client);
  assert.equal(res.status, 429);
  assert.match(((await res.json()) as { error: string }).error, /wait a few minutes/);
});

test("POST says the assistant is unavailable when no API key is configured", async () => {
  const saved = { GEMINI_API_KEY: process.env.GEMINI_API_KEY, GOOGLE_API_KEY: process.env.GOOGLE_API_KEY };
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  const original = console.error;
  console.error = () => {};
  try {
    const res = await POST(post(ask("q")));
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "The assistant isn't available right now." });
  } finally {
    console.error = original;
    for (const [k, v] of Object.entries(saved)) if (v !== undefined) process.env[k] = v;
  }
});
