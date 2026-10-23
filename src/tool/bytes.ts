// 字节工具：CRC32、大端整数、拼接、Latin-1 / UTF-8 编解码。

const table = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(b: Uint8Array, start = 0, end = b.length) {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = table[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
export const u16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];

export function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export const utf8 = (s: string) => new TextEncoder().encode(s);
export const fromUtf8 = (b: Uint8Array) => new TextDecoder('utf-8').decode(b);
export function latin1(s: string) {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c > 255) throw new Error('内部错误：Latin-1 文本里出现了非 Latin-1 字符');
    out[i] = c;
  }
  return out;
}
export const fromLatin1 = (b: Uint8Array) => String.fromCharCode(...b);

/** 用浏览器 / Node 自带的解压（zlib 格式） */
export async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
