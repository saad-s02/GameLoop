import { describe, expect, it } from "vitest";
import { chunkNarrative } from "./narrative";

const REAL_SHAPE =
  "Selected Gate 1 (Main). Enter at Gate 1, seated by 18:30. (Plain summary, written without the live narrator.)";

describe("chunkNarrative", () => {
  it("concatenates back to the original string exactly, for several inputs", () => {
    const inputs = [
      REAL_SHAPE,
      "One.",
      "Two words.",
      "A   sentence  with   irregular   spacing.",
      "Trailing space at the end ",
      " Leading space at the start",
      "word",
      "",
    ];
    for (const text of inputs) {
      expect(chunkNarrative(text).join("")).toBe(text);
    }
  });

  it("a multi-word sentence returns at least 2 chunks with the default wordsPerChunk", () => {
    const chunks = chunkNarrative(REAL_SHAPE);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  it("returns an empty array for an empty string", () => {
    expect(chunkNarrative("")).toEqual([]);
  });

  it("returns a single-element array for a single token", () => {
    expect(chunkNarrative("word")).toEqual(["word"]);
  });

  it("never returns an empty-string chunk", () => {
    const inputs = [REAL_SHAPE, "One.", "Two words.", "word", "A   sentence  with   irregular   spacing."];
    for (const text of inputs) {
      for (const chunk of chunkNarrative(text)) {
        expect(chunk).not.toBe("");
      }
    }
  });

  it("preserves whitespace between words with no doubling or dropping (via concat-equals-original)", () => {
    const text = "Selected Gate 1 (Main). Enter at Gate 1, seated by 18:30.";
    expect(chunkNarrative(text).join("")).toBe(text);
  });

  it("honors a custom wordsPerChunk", () => {
    const text = "one two three four five six seven";
    const chunks = chunkNarrative(text, 2);
    expect(chunks.join("")).toBe(text);
    expect(chunks.length).toBe(4); // 2 + 2 + 2 + 1 words
  });
});
