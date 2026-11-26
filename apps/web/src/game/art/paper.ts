import type { PaperStyle } from '@doodle/sim';
import { DESK, MARGIN, PAPER, RULE } from './palette';
import { makeCanvas } from './doodles';

export const PAPER_TILE = 256;
/** Ruled line spacing. Also used for graph and dot grids. */
export const LINE_GAP = 32;

function grain(ctx: CanvasRenderingContext2D, w: number, h: number, strength: number, seed: number): void {
  const img = ctx.getImageData(0, 0, w, h);
  let s = seed;
  for (let i = 0; i < img.data.length; i += 4) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const n = ((s >>> 24) / 255 - 0.5) * strength;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

export function paperColor(style: PaperStyle): string {
  return style === 'sticky' ? '#fff1a6' : PAPER;
}

export function drawPaperTile(style: PaperStyle): HTMLCanvasElement {
  const size = PAPER_TILE;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = paperColor(style);
  ctx.fillRect(0, 0, size, size);
  grain(ctx, size, size, 10, 12345);

  ctx.strokeStyle = RULE;
  ctx.fillStyle = RULE;
  switch (style) {
    case 'ruled':
    case 'sticky': {
      ctx.globalAlpha = style === 'sticky' ? 0.35 : 0.75;
      ctx.lineWidth = 1.5;
      for (let y = LINE_GAP - 1; y < size; y += LINE_GAP) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(size, y + 0.5);
        ctx.stroke();
      }
      break;
    }
    case 'graph': {
      ctx.strokeStyle = '#8cc7b5';
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = 1;
      for (let i = 0; i < size; i += LINE_GAP / 4) {
        ctx.beginPath();
        ctx.moveTo(i + 0.5, 0);
        ctx.lineTo(i + 0.5, size);
        ctx.moveTo(0, i + 0.5);
        ctx.lineTo(size, i + 0.5);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.6;
      for (let i = 0; i < size; i += LINE_GAP) {
        ctx.beginPath();
        ctx.moveTo(i + 0.5, 0);
        ctx.lineTo(i + 0.5, size);
        ctx.moveTo(0, i + 0.5);
        ctx.lineTo(size, i + 0.5);
        ctx.stroke();
      }
      break;
    }
    case 'dotted': {
      ctx.fillStyle = '#9a9a9a';
      ctx.globalAlpha = 0.7;
      for (let y = LINE_GAP / 2; y < size; y += LINE_GAP) {
        for (let x = LINE_GAP / 2; x < size; x += LINE_GAP) {
          ctx.beginPath();
          ctx.arc(x, y, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
  }
  ctx.globalAlpha = 1;
  return canvas;
}

export function drawDeskTile(): HTMLCanvasElement {
  const size = PAPER_TILE;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = DESK;
  ctx.fillRect(0, 0, size, size);
  let s = 99;
  const rand = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 40; i++) {
    const y = rand() * size;
    ctx.strokeStyle = rand() > 0.5 ? 'rgba(40,24,12,0.35)' : 'rgba(150,110,70,0.25)';
    ctx.lineWidth = 1 + rand() * 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= size; x += 32) ctx.lineTo(x, y + Math.sin((x + i * 13) / 40) * 3);
    ctx.stroke();
  }
  grain(ctx, size, size, 18, 777);
  return canvas;
}

export const MARGIN_COLOR = MARGIN;
