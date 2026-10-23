// PNG 块读写：读取文字块（tEXt / zTXt / iTXt），写入 AIGC 标识。
import { concat, crc32, fromLatin1, fromUtf8, inflate, latin1, u32, utf8 } from './bytes';

export const PNG_SIG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const XMP_KEYWORD = 'XML:com.adobe.xmp';
export const AIGC_KEYWORD = 'AIGC';

export const isPng = (b: Uint8Array) => b.length >= 8 && PNG_SIG.every((v, i) => b[i] === v);

export interface Chunk {
  type: string;
  /** 整个块在文件里的起止位置（含长度、类型、CRC） */
  start: number;
  end: number;
  data: Uint8Array;
}

export function readChunks(b: Uint8Array): Chunk[] {
  if (!isPng(b)) throw new Error('不是有效的 PNG 文件');
  const out: Chunk[] = [];
  let o = 8;
  while (o + 12 <= b.length) {
    const len = u32(b, o);
    const type = fromLatin1(b.subarray(o + 4, o + 8));
    const end = o + 12 + len;
    if (end > b.length) throw new Error('PNG 文件不完整，可能下载或复制时损坏了');
    out.push({ type, start: o, end, data: b.subarray(o + 8, o + 8 + len) });
    o = end;
    if (type === 'IEND') break;
  }
  if (!out.length || out[0].type !== 'IHDR') throw new Error('PNG 文件结构不对，可能已损坏');
  if (out[out.length - 1].type !== 'IEND') throw new Error('PNG 文件不完整，可能下载或复制时损坏了');
  return out;
}

export function makeChunk(type: string, data: Uint8Array) {
  const out = new Uint8Array(12 + data.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  out.set(latin1(type), 4);
  out.set(data, 8);
  v.setUint32(8 + data.length, crc32(out, 4, 8 + data.length));
  return out;
}

/** tEXt：关键字\0文本（Latin-1） */
export const tEXt = (keyword: string, text: string) => makeChunk('tEXt', concat([latin1(keyword), new Uint8Array([0]), latin1(text)]));
/** iTXt（不压缩）：关键字\0 压缩标志 0、压缩方法 0、语言标签\0、翻译关键字\0、UTF-8 文本 */
export const iTXt = (keyword: string, text: string) => makeChunk('iTXt', concat([latin1(keyword), new Uint8Array([0, 0, 0, 0, 0]), utf8(text)]));

export interface TextEntry {
  type: string;
  keyword: string;
  text: string;
}

/** 读出所有文字块（含压缩的 zTXt / iTXt） */
export async function readTexts(b: Uint8Array): Promise<TextEntry[]> {
  const out: TextEntry[] = [];
  for (const c of readChunks(b)) {
    if (c.type !== 'tEXt' && c.type !== 'zTXt' && c.type !== 'iTXt') continue;
    const d = c.data;
    const z = d.indexOf(0);
    if (z < 0) continue;
    const keyword = fromLatin1(d.subarray(0, z));
    try {
      if (c.type === 'tEXt') out.push({ type: c.type, keyword, text: fromLatin1(d.subarray(z + 1)) });
      else if (c.type === 'zTXt') out.push({ type: c.type, keyword, text: fromLatin1(await inflate(d.subarray(z + 2))) });
      else {
        const compressed = d[z + 1] === 1;
        let p = z + 3;
        p = d.indexOf(0, p) + 1; // 语言标签
        p = d.indexOf(0, p) + 1; // 翻译关键字
        if (p <= 0) continue;
        const body = d.subarray(p);
        out.push({ type: c.type, keyword, text: fromUtf8(compressed ? await inflate(body) : body) });
      }
    } catch {
      // 单个块解压失败不影响其他块
    }
  }
  return out;
}

/**
 * 写入 AIGC 标识：去掉已有的 XMP 块和 AIGC 文字块，在 IHDR 后面插入新的 XMP（iTXt）和 AIGC（tEXt）块。
 * 其他块（含像素数据）原样保留。
 */
export function writePngLabel(b: Uint8Array, xmp: string, asciiJson: string) {
  const chunks = readChunks(b);
  const parts: Uint8Array[] = [PNG_SIG];
  for (const c of chunks) {
    if (c.type === 'tEXt' || c.type === 'zTXt' || c.type === 'iTXt') {
      const z = c.data.indexOf(0);
      const kw = z > 0 ? fromLatin1(c.data.subarray(0, z)) : '';
      if (kw === XMP_KEYWORD || kw === AIGC_KEYWORD) continue;
    }
    parts.push(b.subarray(c.start, c.end));
    if (c.type === 'IHDR') parts.push(iTXt(XMP_KEYWORD, xmp), tEXt(AIGC_KEYWORD, asciiJson));
  }
  return concat(parts);
}

/** 取已有的 XMP 文本（没有返回 null） */
export async function readPngXmp(b: Uint8Array) {
  return (await readTexts(b)).find((t) => t.keyword === XMP_KEYWORD)?.text ?? null;
}
