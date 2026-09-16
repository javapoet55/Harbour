/**
 * `SpeechText.chunks(_:)` (ios/Sources/NexdoCore/SpeechText.swift:6-29):
 * "Keep every request below the server's 4,000 UTF-16-unit limit, preserving the full answer and
 * preferring word boundaries."
 *
 * JavaScript strings are already UTF-16, so `String.length` is Swift's `utf16.count` exactly.
 *
 * DIVERGENCE: Swift walks `Character`s (extended grapheme clusters); this walks code points, because
 * `Intl.Segmenter` is not guaranteed on Hermes. The two differ only when a combining sequence or a
 * ZWJ emoji straddles the 3,500-unit boundary, where this may split one cluster that Swift would keep
 * whole. The text is never lost either way.
 */
export const SPEECH_CHUNK_LIMIT = 3500;

export function speechChunks(text: string): string[] {
  const result: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    let end = 0;
    let boundary: number | null = null;
    let length = 0;

    while (end < remaining.length) {
      const point = remaining.codePointAt(end) as number;
      const size = point > 0xffff ? 2 : 1;
      if (length + size > SPEECH_CHUNK_LIMIT) break;
      length += size;
      // `if remaining[end].isWhitespace { boundary = next }`
      if (/\s/u.test(String.fromCodePoint(point))) boundary = end + size;
      end += size;
    }

    // "A pathological extended grapheme may exceed the limit by itself."
    if (end === 0) end = (remaining.codePointAt(0) as number) > 0xffff ? 2 : 1;
    else if (end !== remaining.length && boundary !== null) end = boundary;

    const chunk = remaining.slice(0, end);
    if (chunk.trim().length > 0) result.push(chunk);
    remaining = remaining.slice(end);
  }

  return result;
}
