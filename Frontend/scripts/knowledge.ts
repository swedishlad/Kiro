// Regenerates server/knowledge.ts, the chat assistant's knowledge base, from Backend/data.
// Run it after rebuilding the backend artifacts: `npm run knowledge` (npm test fails until you do).

import { readFileSync, writeFileSync } from "node:fs";

import { buildKnowledge, knowledgeModule, readKnowledgeInputs } from "../src/chat/knowledge.ts";

const backend = new URL("../../Backend/data/", import.meta.url);
const markdown = buildKnowledge(readKnowledgeInputs((p) => readFileSync(new URL(p, backend), "utf8")));
writeFileSync(new URL("../server/knowledge.ts", import.meta.url), knowledgeModule(markdown));
console.log(`server/knowledge.ts: ${markdown.length.toLocaleString("en-US")} characters of Markdown`);
