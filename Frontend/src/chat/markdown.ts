// A small Markdown reader for the assistant's replies: paragraphs, headings, lists, pipe tables,
// **bold**, *italic*, `code` and [links](…). It returns a tree that Chat.tsx renders as React
// elements, so model output never reaches the page as HTML. Unfinished syntax mid-stream (an
// unclosed ** or a half-typed link) simply stays as plain text until it completes.

export type Inline =
  | { type: "text"; text: string }
  | { type: "strong" | "em"; children: Inline[] }
  | { type: "code"; text: string }
  | { type: "link"; href: string; children: Inline[] };

export type Block =
  | { type: "p"; children: Inline[] }
  | { type: "heading"; children: Inline[] }
  | { type: "ul"; items: Inline[][] }
  | { type: "ol"; items: Inline[][] }
  | { type: "table"; head: Inline[][]; rows: Inline[][][] };

/** In-site hash routes, web and mail links only; anything else renders as plain text. */
export function safeHref(href: string): string | null {
  if (/^#\/[\w-]*$/.test(href)) return href;
  if (/^(https?:\/\/|mailto:)[^\s<>"']+$/i.test(href)) return href;
  return null;
}

const INLINE = /`([^`\n]+)`|\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*(?=\S)(.+?)(?<=\S)\*\*|\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?!\*)|(?<![\w])_(?=\S)([^_\n]+?)(?<=\S)_(?![\w])/g;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  const text = (t: string) => {
    if (!t) return;
    const last = out[out.length - 1];
    if (last?.type === "text") last.text += t;
    else out.push({ type: "text", text: t });
  };
  let at = 0;
  for (const m of src.matchAll(INLINE)) {
    text(src.slice(at, m.index));
    at = m.index + m[0].length;
    const [whole, code, label, href, strong, em, em2] = m;
    if (code !== undefined) out.push({ type: "code", text: code });
    else if (label !== undefined) {
      const safe = safeHref(href);
      if (safe) out.push({ type: "link", href: safe, children: parseInline(label) });
      else text(label);
    } else if (strong !== undefined) out.push({ type: "strong", children: parseInline(strong) });
    else if ((em ?? em2) !== undefined) out.push({ type: "em", children: parseInline(em ?? em2) });
    else text(whole);
  }
  text(src.slice(at));
  return out;
}

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*?)\s*#*\s*$/;
const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function cells(line: string): Inline[][] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => parseInline(c.trim()));
}

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r/g, "").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ type: "p", children: parseInline(para.join("\n")) });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") {
      flush();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: "heading", children: parseInline(heading[1]) });
      continue;
    }
    if (line.trim().startsWith("|") && i + 1 < lines.length && TABLE_RULE.test(lines[i + 1])) {
      flush();
      const head = cells(line);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(cells(lines[i++]));
      i--;
      blocks.push({ type: "table", head, rows });
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet || numbered) {
      flush();
      const type = bullet ? "ul" : "ol";
      const last = blocks[blocks.length - 1];
      const item = parseInline((bullet ?? numbered)![1]);
      // consecutive items, or items separated by blank lines (a loose list), make one list
      if (last?.type === type) last.items.push(item);
      else blocks.push({ type, items: [item] });
      continue;
    }
    const last = blocks[blocks.length - 1];
    if (!para.length && (last?.type === "ul" || last?.type === "ol") && /^\s{2,}\S/.test(line) && lines[i - 1]?.trim() !== "") {
      // an indented continuation of the previous list item
      const item = last.items[last.items.length - 1];
      item.push({ type: "text", text: "\n" }, ...parseInline(line.trim()));
      continue;
    }
    para.push(line);
  }
  flush();
  return blocks;
}
