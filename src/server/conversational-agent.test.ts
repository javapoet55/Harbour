import { describe, expect, it } from 'vitest';
import { stripInlineMarkdown } from './conversational-agent';

describe('stripInlineMarkdown', () => {
  it('removes bold, italic and code markers but keeps the words', () => {
    expect(stripInlineMarkdown('You have **3 tasks** due, *starting* with `Call Mom`.')).toBe('You have 3 tasks due, starting with Call Mom.');
    expect(stripInlineMarkdown('**Next action:** review the ``draft``')).toBe('Next action: review the draft');
  });

  it('drops unpaired bold and backtick markers', () => {
    expect(stripInlineMarkdown('Finish the **report today')).toBe('Finish the report today');
    expect(stripInlineMarkdown('Open `settings')).toBe('Open settings');
  });

  it('leaves plain text and lone asterisks alone', () => {
    expect(stripInlineMarkdown('Move it to 3 pm tomorrow.')).toBe('Move it to 3 pm tomorrow.');
    expect(stripInlineMarkdown('Budget 2 * 30 minutes')).toBe('Budget 2 * 30 minutes');
    expect(stripInlineMarkdown('snake_case_name stays')).toBe('snake_case_name stays');
  });
});
