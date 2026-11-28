/**
 * A light word filter for chat and names. Strong swear words and slurs, in English and Indonesian, come out
 * as comic-strip symbols, the way a doodle would swear: "#@$%!".
 *
 * It matches whole words only, so "pantai", "santai" and "class" stay as they are. Before matching it undoes
 * the common disguises: capitals, accents, full-width and styled letters, digits and symbols for letters
 * ("sh1t", "$hit") and stretched letters ("fuuuck"). It doesn't catch a word spaced or dotted out
 * ("f u c k"), or letters swapped for look-alikes from other alphabets.
 */

const GRAWLIX = '#@$%&!';

/** Digits and symbols used for letters. */
const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
};

/** A word as the filter compares it: lower case, no accents, digits and symbols read as letters. */
function fold(word: string): string {
  return word
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[013457@$]/g, (c) => LEET[c]);
}

/** Masked only as the whole word. Short words or ones inside common words stay here, not in ROOTS. */
const WORDS = [
  // English
  'fag',
  'fags',
  'dickhead',
  'cocksucker',
  'pussy',
  'pussies',
  'slut',
  'sluts',
  'whore',
  'whores',
  'twat',
  'wanker',
  'bastard',
  'bastards',
  'retard',
  'retards',
  'retarded',
  'tranny',
  'kys',
  // Indonesian and Javanese
  'tai',
  'taik',
  'asu',
  'cok',
  'anjg',
  'njing',
  'entot',
  'memek',
  'memeknya',
  'memekmu',
  'perek',
  'banci',
  'bencong',
];

/** Masked with anything added to the end, such as "-ing", "-er" or "-nya". */
const ROOTS = [
  // English
  'fuck',
  'motherfuck',
  'shit',
  'bitch',
  'cunt',
  'asshole',
  'nigg',
  'faggot',
  // Indonesian and Javanese
  'anjing',
  'kontol',
  'ngentot',
  'ngewe',
  'jembut',
  'pepek',
  'bangsat',
  'bajingan',
  'keparat',
  'pelacur',
  'lonte',
  'pantek',
  'jancok',
  'jancuk',
];

const words = new Set(WORDS);

function isSwear(word: string): boolean {
  const f = fold(word);
  // A letter held down ("fuuuck", "asssshole") is read once and twice. Letters that are simply doubled stay
  // doubled, or "nigger" would fold into "niger" and "nigg-" would match "night".
  const forms = [f, f.replace(/(.)\1{2,}/gu, '$1'), f.replace(/(.)\1{2,}/gu, '$1$1')];
  return forms.some((w) => words.has(w) || ROOTS.some((r) => w.startsWith(r)));
}

function grawlix(length: number): string {
  let s = '';
  for (let i = 0; i < length; i++) s += GRAWLIX[i % GRAWLIX.length];
  return s;
}

/** The text with each swear word swapped for symbols of the same length. */
export function censor(text: string): string {
  return text.replace(/[\p{L}\p{N}@$]+/gu, (word) =>
    isSwear(word) ? grawlix(Array.from(word).length) : word,
  );
}
