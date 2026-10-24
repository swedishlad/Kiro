// Rebuilds reading-order lines from text placed at positions on a page: PDF.js's text runs, or the
// words OCR found with their boxes. Shared by the PDF reader and the OCR reader.

export interface TextRun {
  str: string;
  /** Left edge and baseline, with y growing down the page */
  x: number;
  y: number;
  width: number;
  /** Text height, for how close two baselines must be to share a line */
  height: number;
}

/**
 * Runs whose baselines are within half a line of each other share a line, left to right, so a label
 * and the amount printed beside it ("Amount Due ....... $233.67") end up on one line however far
 * apart they sit or in whatever order they were found.
 */
export function textLines(runs: TextRun[]): string {
  const sorted = runs.filter((r) => r.str.trim() !== "").sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: { y: number; h: number; runs: TextRun[] }[] = [];
  for (const r of sorted) {
    const h = r.height > 0 ? r.height : 10;
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - r.y) <= Math.max(1, Math.min(last.h, h) * 0.5)) last.runs.push(r);
    else lines.push({ y: r.y, h, runs: [r] });
  }
  return lines
    .map((line) => {
      const ordered = line.runs.sort((a, b) => a.x - b.x);
      let out = "";
      let end = -Infinity;
      for (const r of ordered) {
        // Runs that touch continue a word; a visible gap is a space.
        if (out && r.x - end > line.h * 0.15 && !out.endsWith(" ") && !r.str.startsWith(" ")) out += " ";
        out += r.str;
        end = r.x + r.width;
      }
      return out.replace(/\s+/g, " ").trim();
    })
    .join("\n");
}
