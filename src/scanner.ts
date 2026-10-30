export interface WordRange {
  from: number;
  to: number;
  word: string;
}

export interface TextRange {
  from: number;
  to: number;
}

export type Direction = "next" | "previous";

const WORD_PATTERN = /[\p{L}\p{M}]+(?:[\u2019'][\p{L}\p{M}]+)*/gu;

export function findWordRanges(text: string): WordRange[] {
  const words: WordRange[] = [];

  for (const match of text.matchAll(WORD_PATTERN)) {
    const word = match[0];
    const from = match.index;
    if (from === undefined) continue;

    words.push({ from, to: from + word.length, word });
  }

  return words;
}

export function orderWordRanges(
  ranges: readonly WordRange[],
  cursorOffset: number,
  direction: Direction
): WordRange[] {
  if (direction === "next") {
    const after = ranges.filter(range => range.to > cursorOffset);
    const wrapped = ranges.filter(range => range.to <= cursorOffset);
    return [...after, ...wrapped];
  }

  const before = ranges.filter(range => range.from < cursorOffset).reverse();
  const wrapped = ranges.filter(range => range.from >= cursorOffset).reverse();
  return [...before, ...wrapped];
}

export function findMarkdownExclusionRanges(text: string): TextRange[] {
  const excluded: TextRange[] = [];
  let offset = 0;
  let fence: "`" | "~" | null = null;
  let frontmatter = text.startsWith("---\n");
  let mathBlock = false;
  let htmlCommentStart: number | null = null;

  for (const lineWithNewline of text.match(/.*(?:\n|$)/g) ?? []) {
    if (lineWithNewline.length === 0) continue;
    const line = lineWithNewline.endsWith("\n") ? lineWithNewline.slice(0, -1) : lineWithNewline;
    const lineEnd = offset + lineWithNewline.length;

    if (frontmatter) {
      excluded.push({ from: offset, to: lineEnd });
      if (offset > 0 && line.trim() === "---") frontmatter = false;
      offset = lineEnd;
      continue;
    }

    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0] as "`" | "~";
      if (fence === null || fence === marker) fence = fence === null ? marker : null;
      excluded.push({ from: offset, to: lineEnd });
      offset = lineEnd;
      continue;
    }

    if (fence !== null) {
      excluded.push({ from: offset, to: lineEnd });
      offset = lineEnd;
      continue;
    }

    if (line.trim().startsWith("$$")) {
      mathBlock = !mathBlock;
      excluded.push({ from: offset, to: lineEnd });
      offset = lineEnd;
      continue;
    }

    if (mathBlock) {
      excluded.push({ from: offset, to: lineEnd });
      offset = lineEnd;
      continue;
    }

    collectPatternRanges(line, offset, /`+[^`]*`+/g, excluded);
    collectPatternRanges(line, offset, /\$(?!\$)[^$\n]+\$/g, excluded);
    collectPatternRanges(line, offset, /(?:https?:\/\/|www\.)[^\s)>]+/gi, excluded);
    collectPatternRanges(line, offset, /\]\([^\n)]*\)/g, excluded);
    collectPatternRanges(line, offset, /\[\[[^\n\]]*\]\]/g, excluded);
    collectPatternRanges(line, offset, /(^|\s)#[\p{L}\p{M}\p{N}_/-]+/gu, excluded);

    for (let index = 0; index < line.length; index++) {
      if (htmlCommentStart === null && line.startsWith("<!--", index)) {
        htmlCommentStart = offset + index;
        index += 3;
      } else if (htmlCommentStart !== null && line.startsWith("-->", index)) {
        excluded.push({ from: htmlCommentStart, to: offset + index + 3 });
        htmlCommentStart = null;
        index += 2;
      }
    }

    offset = lineEnd;
  }

  if (htmlCommentStart !== null) excluded.push({ from: htmlCommentStart, to: text.length });
  return excluded.sort((a, b) => a.from - b.from);
}

function collectPatternRanges(
  line: string,
  lineOffset: number,
  pattern: RegExp,
  output: TextRange[]
): void {
  for (const match of line.matchAll(pattern)) {
    if (match.index === undefined) continue;
    output.push({ from: lineOffset + match.index, to: lineOffset + match.index + match[0].length });
  }
}

export function isRangeExcluded(range: WordRange, excluded: readonly TextRange[]): boolean {
  return excluded.some(item => item.from < range.to && item.to > range.from);
}
