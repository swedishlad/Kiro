// The assistant's knowledge base must match the backend artifacts the pages show. If the first test
// fails after a backend rebuild, run `npm run knowledge` and commit server/knowledge.ts.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { KNOWLEDGE } from "../../server/knowledge.ts";
import { trailing12 } from "../data/derive.ts";
import { fmtNum } from "../data/format.ts";
import { buildKnowledge, knowledgeModule, readKnowledgeInputs } from "./knowledge.ts";

const backend = new URL("../../../Backend/data/", import.meta.url);
const inputs = readKnowledgeInputs((p) => readFileSync(new URL(p, backend), "utf8"));
const markdown = buildKnowledge(inputs);

test("server/knowledge.ts is up to date with Backend/data", () => {
  const committed = readFileSync(new URL("../../server/knowledge.ts", import.meta.url), "utf8");
  assert.ok(committed === knowledgeModule(markdown), "server/knowledge.ts is stale: run `npm run knowledge`");
  assert.equal(KNOWLEDGE, markdown); // the template-literal escaping round-trips
});

test("the knowledge base carries the figures the Overview shows", () => {
  const ttm = trailing12(inputs.eia);
  assert.ok(markdown.includes(`**${fmtNum(ttm.priceCents, 1)}¢/kWh**`));
  assert.ok(markdown.includes(`**${fmtNum(inputs.consumptionStats.typicalAccount.annualKwh)} kWh a year**`));
  for (const cents of [17.185, 17.323, 15.934, 18.921]) assert.ok(markdown.includes(`${cents}¢`), String(cents));
  assert.ok(markdown.includes("**-$187.79**")); // savings_model.json example, to the cent
});

test("the knowledge base covers every month, town and tab", () => {
  // one month-by-month row per EIA month
  assert.equal((markdown.match(/^\| [A-Z][a-z]{2} \d{4}\*? \| \d+\.\d{2} \| [\d,]+ \| [\d,]+ \|/gm) ?? []).length, inputs.eia.length);
  for (const t of inputs.towns) assert.ok(markdown.includes(`| ${t.name} | ${t.county} | ${t.zone} |`), t.name);
  for (const tab of ["overview", "usage", "prices", "grid", "towns", "sources"]) assert.ok(markdown.includes(`(#/${tab})`), tab);
});
