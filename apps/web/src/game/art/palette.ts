/** Shared colors so the canvas world and the DOM HUD read as one notebook. */
export const INK = '#2b2b2b';
export const PAPER = '#f6f1e3';
export const RULE = '#9fc3e6';
export const MARGIN = '#e58b8b';
export const DESK = '#6b4a2f';

export interface TeamStyle {
  name: string;
  color: string;
  light: string;
  hex: number;
}

export const TEAMS: TeamStyle[] = [
  { name: 'Red Pencils', color: '#d64545', light: '#f3b3a8', hex: 0xd64545 },
  { name: 'Blue Pens', color: '#2f6fd6', light: '#a9c6f2', hex: 0x2f6fd6 },
  { name: 'Green Markers', color: '#3b9b4b', light: '#b5e0b5', hex: 0x3b9b4b },
  { name: 'Orange Crayons', color: '#e08a1e', light: '#f6d29d', hex: 0xe08a1e },
];

export function team(index: number): TeamStyle {
  return TEAMS[index % TEAMS.length];
}

/** A shape per team so teams read without relying on color alone. */
export const TEAM_GLYPH = ['●', '▲', '■', '◆'];

export function teamGlyph(index: number): string {
  return TEAM_GLYPH[index % TEAM_GLYPH.length];
}

export function cssHexToNumber(hex: string): number {
  return parseInt(hex.slice(1), 16);
}
