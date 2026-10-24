// The chat endpoint (api/chat.ts) against a fake SDK client: request validation, the request it
// sends to Claude, and the NDJSON stream it returns. No network and no API key needed.

import assert from "node:assert/strict";
import { test } from "node:test";

import Anthropic from "@anthropic-ai/sdk";

import { LIMITS, handleChat, parseChatRequest, rateLimited, type ChatClient, type ChatEvent } from "../../api/chat.ts";
import { KNOWLEDGE } from "../../server/knowledge.ts";

type Params = Record<string, unknown> & { messages: { role: string; content: string }[]; system: { text: string; cache_control?: unknown }[] };

/** A client whose stream yields `deltas` as text and then finishes with `stop`, or throws `fail`. */
function fakeClient(deltas: string[], stop = "end_turn", fail?: Error) {
  const calls: Params[] = [];
  const client = {
    beta: {
      messages: {
        stream(params: Params) {
          calls.push(params);
          return {
            async *[Symbol.asyncIterator]() {
              for (const text of deltas) yield { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } };
              if (fail) throw fail;
            },
            finalMessage: async () => ({ model: "claude-opus-5-5", stop_reason: stop, usage: { input_tokens: 10, output_tokens: 5 } }),
            abort() {},
          };
        },
      },
    },
  };
  return { client: client as unknown as ChatClient, calls };
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

test("handleChat sends the cached knowledge base and streams the answer", async () => {
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
  assert.equal(p.model, "claude-opus-5-5");
  assert.equal(p.fallbacks, "default");
  assert.deepEqual(p.betas, ["server-side-fallback-2026-07-01"]);
  assert.equal(p.temperature, undefined);
  assert.equal(p.system[1].text, KNOWLEDGE);
  assert.deepEqual(p.system[1].cache_control, { type: "ephemeral" });
  assert.deepEqual(p.messages, [
    { role: "user", content: "What does basic service cost?" },
    { role: "system", content: "Today's date is 2026-10-24. The visitor is on the Prices & savings tab (#/prices)." },
  ]);
});

test("handleChat reports truncation, refusals and API failures in the stream", async () => {
  assert.deepEqual((await events(await handleChat(post(ask("q")), fakeClient(["a"], "max_tokens").client))).at(-1), { type: "done", truncated: true });
  assert.deepEqual((await events(await handleChat(post(ask("q")), fakeClient(["a"], "refusal").client))).at(-1), { type: "refusal" });
  const busy = new Anthropic.RateLimitError(429, undefined, "rate limited", new Headers());
  const original = console.error;
  console.error = () => {};
  try {
    const out = await events(await handleChat(post(ask("q")), fakeClient(["par"], "end_turn", busy).client));
    assert.deepEqual(out, [{ type: "text", text: "par" }, { type: "error", message: "The assistant is busy right now. Please try again in a minute." }]);
    const broken = await events(await handleChat(post(ask("q")), fakeClient([], "end_turn", new Error("no key")).client));
    assert.deepEqual(broken, [{ type: "error", message: "The assistant isn't available right now." }]);
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
