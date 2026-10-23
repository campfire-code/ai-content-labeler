// 纯函数：不依赖界面和本机能力，便于单元测试。
import { extractAigcFromXmp, parseAigc, type AigcInfo } from './aigc';
import { fromLatin1, fromUtf8 } from './bytes';
import { isJpeg, readJpegOtherTexts, readJpegXmp } from './jpeg';
import { isPng, readTexts, AIGC_KEYWORD, XMP_KEYWORD } from './png';

export type ImageFormat = 'png' | 'jpg' | 'webp' | 'other';

export function detectFormat(b: Uint8Array): ImageFormat {
  if (isPng(b)) return 'png';
  if (isJpeg(b)) return 'jpg';
  if (b.length >= 12 && fromLatin1(b.subarray(0, 4)) === 'RIFF' && fromLatin1(b.subarray(8, 12)) === 'WEBP') return 'webp';
  return 'other';
}

export interface Inspection {
  format: ImageFormat;
  /** 读到的 AIGC 字段（以第一个能解析的为准） */
  info: Partial<AigcInfo> | null;
  /** 在哪些位置找到了标识，例如「XMP」「PNG 文字块 AIGC」 */
  where: string[];
}

const JSON_IN_TEXT = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)?\}/g;
function findJsonIn(text: string) {
  for (const m of text.match(JSON_IN_TEXT) ?? []) {
    const v = parseAigc(m);
    if (v) return v;
  }
  return null;
}

/** 在整个文件里找 XMP 包（WebP 等没有专门解析的格式用） */
function rawXmp(b: Uint8Array) {
  const s = fromLatin1(b);
  const i = s.indexOf('<x:xmpmeta');
  const j = s.indexOf('</x:xmpmeta>', i);
  return i >= 0 && j > i ? fromUtf8(b.subarray(i, j + 12)) : null;
}

/** 检查图片里有没有 AIGC 隐式标识 */
export async function inspect(b: Uint8Array): Promise<Inspection> {
  const format = detectFormat(b);
  const where: string[] = [];
  let info: Partial<AigcInfo> | null = null;
  const hit = (label: string, v: Partial<AigcInfo> | null) => {
    if (!v) return;
    where.push(label);
    info ??= v;
  };
  if (format === 'png') {
    for (const t of await readTexts(b)) {
      if (t.keyword === XMP_KEYWORD) {
        const j = extractAigcFromXmp(t.text);
        if (j) hit('XMP', parseAigc(j) ?? {});
      } else if (t.keyword === AIGC_KEYWORD) hit(`PNG 文字块 ${AIGC_KEYWORD}`, parseAigc(t.text) ?? {});
      else hit(`PNG 文字块 ${t.keyword}`, findJsonIn(t.text));
    }
  } else if (format === 'jpg') {
    const xmp = readJpegXmp(b);
    const j = xmp && extractAigcFromXmp(xmp);
    if (j) hit('XMP', parseAigc(j) ?? {});
    for (const t of readJpegOtherTexts(b)) hit(t.where, findJsonIn(t.text));
  } else {
    const xmp = rawXmp(b);
    const j = xmp && extractAigcFromXmp(xmp);
    if (j) hit('XMP', parseAigc(j) ?? {});
  }
  return { format, info, where };
}

/** 内容编号：前缀 + 日期 + 文件内容摘要前 12 位（同一文件每次生成的编号相同） */
export function makeProduceId(prefix: string, date: Date, sha256Hex: string) {
  const d = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  return `${prefix.trim()}${d}-${sha256Hex.slice(0, 12)}`;
}

export type Corner = 'tl' | 'tr' | 'bl' | 'br';
export const SIZE_RATIO: Record<string, number> = { s: 0.05, m: 0.07, l: 0.1 };
/** 文字最小高度：12 像素，且不小于图片短边的 3% */
export const minFontPx = (w: number, h: number) => Math.max(12, Math.ceil(Math.min(w, h) * 0.03));

export interface Badge {
  font: number;
  x: number; y: number; w: number; h: number;
  /** 文字基线左端 */
  tx: number; ty: number;
}

/**
 * 计算角标位置与大小。widthAt100 是文字在 100 像素字号下的宽度（由画布测量后传入）。
 * 放不下时缩小字号，但不低于最小高度；仍放不下就报错。
 */
export function badgeLayout(imgW: number, imgH: number, widthAt100: number, corner: Corner, ratio: number): Badge {
  const short = Math.min(imgW, imgH);
  const margin = Math.max(4, Math.round(short * 0.025));
  const min = minFontPx(imgW, imgH);
  let font = Math.max(min, Math.round(short * ratio));
  const boxW = (f: number) => Math.ceil((widthAt100 * f) / 100 + f * 0.9);
  const maxW = imgW - margin * 2;
  if (boxW(font) > maxW) font = Math.floor((maxW / (widthAt100 / 100 + 0.9)));
  if (font < min || imgH < min * 1.5 + margin * 2) throw new Error(`图片太小（${imgW}×${imgH}），放不下清晰可辨的标识文字，请缩短文字或换一张更大的图`);
  const w = boxW(font);
  const h = Math.ceil(font * 1.5);
  const x = corner === 'tl' || corner === 'bl' ? margin : imgW - margin - w;
  const y = corner === 'tl' || corner === 'tr' ? margin : imgH - margin - h;
  return { font, x, y, w, h, tx: x + Math.round(font * 0.45), ty: y + Math.round(h / 2) };
}

export function checkLabelText(text: string) {
  const t = text.trim();
  if (!t) throw new Error('显式标识的文字不能为空，例如填「AI生成」');
  if ([...t].length > 20) throw new Error('显式标识的文字太长（超过 20 个字），请写简短些，例如「AI生成」「由人工智能生成」');
  return t;
}

export function baseName(name: string) {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

/** 输出文件名：PNG / JPG 保持原名；WebP 等转成 PNG */
export function outputName(name: string, format: ImageFormat) {
  if (format === 'png' || format === 'jpg') return name;
  return `${baseName(name)}.png`;
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/** CSV（带 BOM，Excel 打开不乱码） */
export function toCsv(header: string[], rows: (string | number)[][]) {
  return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
