/** Splits text into contiguous slices of ~wordsPerChunk words each, for
 *  progressive SSE delivery. Concatenating the result yields the original
 *  string exactly; the rendered narrative is unchanged, only its delivery. */
export function chunkNarrative(text: string, wordsPerChunk = 3): string[] {
  if (text.length === 0) return [];
  const words = [...text.matchAll(/\S+/g)];
  if (words.length === 0) return [text];
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += wordsPerChunk) {
    const start = i === 0 ? 0 : words[i]!.index!;
    const nextIdx = i + wordsPerChunk;
    const end = nextIdx >= words.length ? text.length : words[nextIdx]!.index!;
    chunks.push(text.slice(start, end));
  }
  return chunks;
}
