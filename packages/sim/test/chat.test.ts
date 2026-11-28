import { describe, expect, it } from 'vitest';
import { CHAT_MAX_CHARS, censor, cleanChat } from '../src';

describe('cleanChat', () => {
  it('keeps an ordinary line as it is', () => {
    expect(cleanChat('nice shot! 10/10')).toBe('nice shot! 10/10');
    expect(cleanChat('Bagus sekali, gg')).toBe('Bagus sekali, gg');
  });

  it('gives an empty line for anything that is not text', () => {
    expect(cleanChat(undefined)).toBe('');
    expect(cleanChat(42)).toBe('');
    expect(cleanChat({ text: 'hi' })).toBe('');
  });

  it('turns line breaks and runs of spaces into single spaces', () => {
    expect(cleanChat('  ready\n\n\tset   go  ')).toBe('ready set go');
  });

  it('drops characters that reorder or hide text', () => {
    // U+202E would show the rest of the line backwards.
    expect(cleanChat('abc\u202edef')).toBe('abcdef');
    expect(cleanChat('a\u2066b\u2069c\u200bd\ufeffe')).toBe('abcde');
    expect(cleanChat('bell\u0007')).toBe('bell');
  });

  it('keeps emoji built with joiners and variation selectors', () => {
    expect(cleanChat('👩\u200d💻 ok')).toBe('👩\u200d💻 ok');
    expect(cleanChat('❤️ 1️⃣ 👍🏽')).toBe('❤️ 1️⃣ 👍🏽');
  });

  it('normalizes accents to their composed form', () => {
    expect(cleanChat('café')).toBe('café');
  });

  it('trims a pile of combining marks down to a few', () => {
    const zalgo = 'h' + '̶̷̸̹̺̻̼̽'.repeat(4) + 'i';
    const cleaned = cleanChat(zalgo);
    expect(cleaned.startsWith('h')).toBe(true);
    expect(cleaned.endsWith('i')).toBe(true);
    expect(Array.from(cleaned)).toHaveLength(1 + 4 + 1);
  });

  it('gives an empty line when nothing visible is left', () => {
    expect(cleanChat('   ')).toBe('');
    expect(cleanChat('\u3164\u3164')).toBe('');
    expect(cleanChat('\u200b\u202e')).toBe('');
    expect(cleanChat('́̂')).toBe('');
  });

  it('cuts a long line at the limit, counting characters rather than UTF-16 units', () => {
    expect(Array.from(cleanChat('x'.repeat(500)))).toHaveLength(CHAT_MAX_CHARS);
    expect(Array.from(cleanChat('😀'.repeat(200)))).toHaveLength(CHAT_MAX_CHARS);
  });

  it('leaves no dangling joiner where the cut falls inside an emoji sequence', () => {
    const line = 'x'.repeat(CHAT_MAX_CHARS - 2) + '👩\u200d💻';
    expect(cleanChat(line)).toBe('x'.repeat(CHAT_MAX_CHARS - 2) + '👩');
  });
});

describe('censor', () => {
  it('swaps swear words for symbols of the same length', () => {
    expect(censor('oh shit, nice shot')).toBe('oh #@$%, nice shot');
    expect(censor('anjing lu')).toBe('#@$%&! lu');
    expect(censor('Fuck!')).toBe('#@$%!');
  });

  it('catches the common disguises', () => {
    for (const word of [
      'SHIT',
      'sh1t',
      '$hit',
      'fuuuuck',
      'f\u00fcck',
      '\uff46\uff55\uff43\uff4b',
      'asssshole',
    ])
      expect(censor(word)).toMatch(/^[#@$%&!]+$/);
  });

  it('masks a root with whatever is added to it', () => {
    expect(censor('fucking')).toBe('#@$%&!#');
    expect(censor('kontolnya')).toBe('#@$%&!#@$');
  });

  it('leaves words that only contain one alone', () => {
    const safe = 'pantai santai class assassin Scunthorpe cokelat memekik Taiwan night Niger Nigeria';
    expect(censor(safe)).toBe(safe);
  });
});
