import { describe, expect, it } from "vitest";
import {
  findMarkdownExclusionRanges,
  findWordRanges,
  isRangeExcluded,
  orderWordRanges
} from "../src/scanner";

describe("findWordRanges", () => {
  it("finds unicode words and contractions with offsets", () => {
    const text = "Hello naïve don’t can't";
    expect(findWordRanges(text)).toEqual([
      { from: 0, to: 5, word: "Hello" },
      { from: 6, to: 11, word: "naïve" },
      { from: 12, to: 17, word: "don’t" },
      { from: 18, to: 23, word: "can't" }
    ]);
  });
});

describe("orderWordRanges", () => {
  const ranges = findWordRanges("one two three");

  it("orders forward and wraps", () => {
    expect(orderWordRanges(ranges, 5, "next").map(range => range.word)).toEqual([
      "two",
      "three",
      "one"
    ]);
  });

  it("orders backward and wraps", () => {
    expect(orderWordRanges(ranges, 5, "previous").map(range => range.word)).toEqual([
      "two",
      "one",
      "three"
    ]);
  });
});

describe("findMarkdownExclusionRanges", () => {
  it("skips frontmatter, code, math, URLs, comments, tags, and link targets", () => {
    const text = [
      "---",
      "alias: mispeling",
      "---",
      "Check mispeling.",
      "`mispeling` #mispeling https://mispeling.test [[mispeling]] [label](mispeling)",
      "```ts",
      "const mispeling = true;",
      "```",
      "$$",
      "mispeling",
      "$$",
      "<!-- mispeling -->"
    ].join("\n");
    const words = findWordRanges(text).filter(range => range.word === "mispeling");
    const excluded = findMarkdownExclusionRanges(text);

    expect(words.map(range => isRangeExcluded(range, excluded))).toEqual([
      true,
      false,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true
    ]);
  });
});
