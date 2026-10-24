import assert from "node:assert/strict";
import { test } from "node:test";

import { parseInline, parseMarkdown, safeHref } from "./markdown.ts";

test("inline: bold, italic, code and safe links", () => {
  assert.deepEqual(parseInline("Rate is **17.185¢** on *National Grid*, see [Prices](#/prices) or `kWh`."), [
    { type: "text", text: "Rate is " },
    { type: "strong", children: [{ type: "text", text: "17.185¢" }] },
    { type: "text", text: " on " },
    { type: "em", children: [{ type: "text", text: "National Grid" }] },
    { type: "text", text: ", see " },
    { type: "link", href: "#/prices", children: [{ type: "text", text: "Prices" }] },
    { type: "text", text: " or " },
    { type: "code", text: "kWh" },
    { type: "text", text: "." },
  ]);
});

test("inline: unsafe or unfinished syntax stays plain text", () => {
  assert.deepEqual(parseInline("[click](javascript:void0)"), [{ type: "text", text: "click" }]);
  assert.deepEqual(parseInline("**half-typed"), [{ type: "text", text: "**half-typed" }]);
  assert.deepEqual(parseInline("Aug 2026* is preliminary, 2 * 3 = 6"), [{ type: "text", text: "Aug 2026* is preliminary, 2 * 3 = 6" }]);
  assert.deepEqual(parseInline("snake_case_name"), [{ type: "text", text: "snake_case_name" }]);
  assert.equal(safeHref("https://www.mass.gov/"), "https://www.mass.gov/");
  assert.equal(safeHref("//evil.example"), null);
  assert.equal(safeHref("data:text/html,x"), null);
});

test("blocks: paragraphs, headings, lists and tables", () => {
  const md = "## Short answer\nYou saved money.\nSecond line.\n\n- one\n- two\n  continued\n\n1. first\n2. second\n\n| Utility | ¢/kWh |\n|---|---:|\n| National Grid | 17.185 |\n| Unitil | 18.921 |\n\nDone.";
  const blocks = parseMarkdown(md);
  assert.deepEqual(
    blocks.map((b) => b.type),
    ["heading", "p", "ul", "ol", "table", "p"],
  );
  assert.deepEqual(blocks[1], { type: "p", children: [{ type: "text", text: "You saved money.\nSecond line." }] });
  const ul = blocks[2] as { items: unknown[][] };
  assert.equal(ul.items.length, 2);
  assert.deepEqual(ul.items[1], [{ type: "text", text: "two" }, { type: "text", text: "\n" }, { type: "text", text: "continued" }]);
  const t = blocks[4] as { head: unknown[][]; rows: unknown[][][] };
  assert.equal(t.head.length, 2);
  assert.deepEqual(t.rows[1], [[{ type: "text", text: "Unitil" }], [{ type: "text", text: "18.921" }]]);
});

test("blocks: a half-streamed table header renders as text until its rule arrives", () => {
  assert.deepEqual(parseMarkdown("| Utility | ¢/kWh |").map((b) => b.type), ["p"]);
});
