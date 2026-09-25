import { speechChunks, SPEECH_CHUNK_LIMIT } from './speechText';

/** `SpeechText.chunks(_:)` (ios/Sources/NexdoCore/SpeechText.swift:6-29). */
describe('speechChunks', () => {
  it('returns one chunk for text inside the limit', () => {
    expect(speechChunks('Pack the boxes.')).toEqual(['Pack the boxes.']);
  });

  it('returns nothing for empty or whitespace-only text', () => {
    expect(speechChunks('')).toEqual([]);
    expect(speechChunks('   \n  ')).toEqual([]);
  });

  it('keeps every chunk within the limit and loses no characters', () => {
    const text = `${'word '.repeat(2000)}end`;
    const chunks = speechChunks(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(SPEECH_CHUNK_LIMIT);
    expect(chunks.join('')).toBe(text);
  });

  it('splits on a word boundary rather than mid-word', () => {
    const chunks = speechChunks(`${'word '.repeat(2000)}end`);
    // `boundary` is the index AFTER the whitespace, so a chunk ends with the space it broke on.
    expect(chunks[0].endsWith(' ')).toBe(true);
    expect(chunks[1].startsWith('word')).toBe(true);
  });

  it('still makes progress when a single run has no whitespace to break on', () => {
    const text = 'x'.repeat(SPEECH_CHUNK_LIMIT * 2 + 7);
    const chunks = speechChunks(text);
    expect(chunks.map((chunk) => chunk.length)).toEqual([SPEECH_CHUNK_LIMIT, SPEECH_CHUNK_LIMIT, 7]);
    expect(chunks.join('')).toBe(text);
  });

  it('counts UTF-16 units, so surrogate pairs are never split', () => {
    // 1,800 astral characters is 3,600 UTF-16 units: over the limit, under it by character count.
    const text = '\u{1F600}'.repeat(1800);
    const chunks = speechChunks(text);
    expect(chunks.join('')).toBe(text);
    for (const chunk of chunks) {
      expect(chunk.length % 2).toBe(0);
      expect(chunk.length).toBeLessThanOrEqual(SPEECH_CHUNK_LIMIT);
    }
  });
});
