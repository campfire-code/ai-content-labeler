// JPEG 段读写：读取 XMP / 注释 / EXIF 段，写入 XMP（APP1）。
import { concat, fromLatin1, fromUtf8, u16, utf8 } from './bytes';

export const XMP_HEADER = 'http://ns.adobe.com/xap/1.0/\0';
export const isJpeg = (b: Uint8Array) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

export interface Segment {
  marker: number;
  start: number;
  end: number;
  data: Uint8Array;
}

/** 读出图像数据（SOS）之前的所有段 */
export function readSegments(b: Uint8Array): { segments: Segment[]; bodyStart: number } {
  if (!isJpeg(b)) throw new Error('不是有效的 JPG 文件');
  const segments: Segment[] = [];
  let o = 2;
  for (;;) {
    if (o + 4 > b.length) throw new Error('JPG 文件不完整，可能下载或复制时损坏了');
    if (b[o] !== 0xff) throw new Error('JPG 文件结构不对，可能已损坏');
    const marker = b[o + 1];
    if (marker === 0xff) { o++; continue; } // 填充字节
    if (marker === 0xda || marker === 0xd9) return { segments, bodyStart: o };
    if (marker >= 0xd0 && marker <= 0xd7) { o += 2; continue; }
    const len = u16(b, o + 2);
    const end = o + 2 + len;
    if (len < 2 || end > b.length) throw new Error('JPG 文件不完整，可能下载或复制时损坏了');
    segments.push({ marker, start: o, end, data: b.subarray(o + 4, end) });
    o = end;
  }
}

const startsWith = (d: Uint8Array, s: string) => d.length >= s.length && fromLatin1(d.subarray(0, s.length)) === s;
export const isXmpSegment = (s: Segment) => s.marker === 0xe1 && startsWith(s.data, XMP_HEADER);

export function readJpegXmp(b: Uint8Array) {
  const s = readSegments(b).segments.find(isXmpSegment);
  return s ? fromUtf8(s.data.subarray(XMP_HEADER.length)) : null;
}

/** 注释段（COM）和 EXIF 段的原始文本，用来在里面找 AIGC JSON */
export function readJpegOtherTexts(b: Uint8Array) {
  return readSegments(b).segments
    .filter((s) => s.marker === 0xfe || (s.marker === 0xe1 && startsWith(s.data, 'Exif\0')))
    .map((s) => ({ where: s.marker === 0xfe ? 'JPG 注释段' : 'EXIF', text: fromUtf8(s.data) }));
}

/** 写入 XMP：去掉已有 XMP 段，新段放在 APP0 / EXIF 之后，其他段与图像数据原样保留 */
export function writeJpegXmp(b: Uint8Array, xmp: string) {
  const { segments, bodyStart } = readSegments(b);
  const payload = concat([utf8(XMP_HEADER), utf8(xmp)]);
  if (payload.length + 2 > 0xffff) throw new Error('XMP 元数据太大，超过 JPG 单段 64KB 的上限，请先用其他软件清理图片里的元数据');
  const seg = new Uint8Array(4 + payload.length);
  seg[0] = 0xff; seg[1] = 0xe1; seg[2] = (payload.length + 2) >> 8; seg[3] = (payload.length + 2) & 0xff;
  seg.set(payload, 4);
  const kept = segments.filter((s) => !isXmpSegment(s));
  // 插在开头连续的 APP0 / APP1(EXIF) 之后，符合 EXIF 要紧跟 SOI 的习惯
  let at = 0;
  while (at < kept.length && (kept[at].marker === 0xe0 || kept[at].marker === 0xe1)) at++;
  const raw = (list: Segment[]) => list.map((s) => b.subarray(s.start, s.end));
  return concat([b.subarray(0, 2), ...raw(kept.slice(0, at)), seg, ...raw(kept.slice(at)), b.subarray(bodyStart)]);
}
