import { describe, expect, it } from 'vitest';
import { deflateSync } from 'node:zlib';
import { concat, crc32, latin1, u32, utf8 } from './bytes';
import { makePng } from './fixtures';
import { makeChunk, readChunks, readPngXmp, readTexts, tEXt, writePngLabel } from './png';

describe('PNG 块', () => {
  it('写入后块顺序为 IHDR、XMP、AIGC、IDAT，CRC 全部正确，像素数据不变', async () => {
    const src = makePng(4, 3);
    const out = writePngLabel(src, '<x:xmpmeta>中文</x:xmpmeta>', '{"Label":"1"}');
    const chunks = readChunks(out);
    expect(chunks.map((c) => c.type)).toEqual(['IHDR', 'iTXt', 'tEXt', 'IDAT', 'IEND']);
    for (const c of chunks) expect(u32(out, c.end - 4)).toBe(crc32(out, c.start + 4, c.end - 4));
    expect(chunks[3].data).toEqual(readChunks(src)[1].data);
    expect(await readPngXmp(out)).toBe('<x:xmpmeta>中文</x:xmpmeta>');
    expect((await readTexts(out)).find((t) => t.keyword === 'AIGC')?.text).toBe('{"Label":"1"}');
  });
  it('重复写入不会产生重复的块，其他文字块保留', async () => {
    const src = makePng(2, 2, undefined, [tEXt('Software', 'Paint')]);
    const twice = writePngLabel(writePngLabel(src, 'a', '{}'), 'b', '{}');
    const texts = await readTexts(twice);
    expect(texts.map((t) => t.keyword).sort()).toEqual(['AIGC', 'Software', 'XML:com.adobe.xmp']);
    expect(await readPngXmp(twice)).toBe('b');
  });
  it('能读压缩的 zTXt 和 iTXt', async () => {
    const z = makeChunk('zTXt', concat([latin1('AIGC'), new Uint8Array([0, 0]), deflateSync(Buffer.from('{"Label":"1"}'))]));
    const i = makeChunk('iTXt', concat([latin1('Comment'), new Uint8Array([0, 1, 0]), latin1('zh'), new Uint8Array([0, 0]), deflateSync(utf8('你好'))]));
    const texts = await readTexts(makePng(2, 2, undefined, [z, i]));
    expect(texts).toEqual([{ type: 'zTXt', keyword: 'AIGC', text: '{"Label":"1"}' }, { type: 'iTXt', keyword: 'Comment', text: '你好' }]);
  });
  it('损坏或截断的 PNG 给出说明', () => {
    expect(() => readChunks(new Uint8Array([1, 2, 3]))).toThrow('不是有效的 PNG');
    expect(() => readChunks(makePng(4, 4).subarray(0, 40))).toThrow('PNG 文件不完整');
  });
});
