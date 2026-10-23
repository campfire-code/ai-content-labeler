import { describe, expect, it } from 'vitest';
import { concat, latin1, utf8 } from './bytes';
import { makeJpeg, seg } from './fixtures';
import { readJpegOtherTexts, readJpegXmp, readSegments, writeJpegXmp, XMP_HEADER } from './jpeg';

const exif = seg(0xe1, concat([latin1('Exif\0\0'), new Uint8Array(20)]));

describe('JPG 段', () => {
  it('XMP 段插在 APP0 / EXIF 之后，图像数据原样保留', () => {
    const src = makeJpeg([exif]);
    const out = writeJpegXmp(src, '<x:xmpmeta>中文</x:xmpmeta>');
    expect(readSegments(out).segments.map((s) => s.marker.toString(16))).toEqual(['e0', 'e1', 'e1', 'db']);
    expect(readJpegXmp(out)).toBe('<x:xmpmeta>中文</x:xmpmeta>');
    const tail = (b: Uint8Array) => b.subarray(readSegments(b).bodyStart);
    expect(tail(out)).toEqual(tail(src));
  });
  it('已有 XMP 时替换，不重复', () => {
    const old = seg(0xe1, concat([latin1(XMP_HEADER), utf8('old')]));
    const out = writeJpegXmp(makeJpeg([old]), 'new');
    expect(readSegments(out).segments.filter((s) => s.marker === 0xe1)).toHaveLength(1);
    expect(readJpegXmp(out)).toBe('new');
  });
  it('读注释段', () => {
    const com = seg(0xfe, utf8('{"Label":"1"}'));
    expect(readJpegOtherTexts(makeJpeg([com]))).toEqual([{ where: 'JPG 注释段', text: '{"Label":"1"}' }]);
  });
  it('损坏或截断的 JPG 给出说明', () => {
    expect(() => readSegments(new Uint8Array([0x89, 0x50]))).toThrow('不是有效的 JPG');
    expect(() => readSegments(makeJpeg().subarray(0, 12))).toThrow('JPG 文件不完整');
  });
  it('XMP 超过 64KB 时报错', () => {
    expect(() => writeJpegXmp(makeJpeg(), 'x'.repeat(70000))).toThrow('64KB');
  });
});
