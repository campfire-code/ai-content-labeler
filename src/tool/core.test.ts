import { describe, expect, it } from 'vitest';
import { aigcJson, buildAigc, buildXmp } from './aigc';
import { concat, latin1, utf8 } from './bytes';
import { badgeLayout, checkLabelText, detectFormat, inspect, makeProduceId, minFontPx, outputName, toCsv } from './core';
import { makeJpeg, makePng, seg } from './fixtures';
import { tEXt, writePngLabel } from './png';
import { writeJpegXmp } from './jpeg';

const info = buildAigc({ producer: '示例科技', produceId: 'X-1' });

describe('检查隐式标识', () => {
  it('PNG：XMP 和 AIGC 文字块都能找到', async () => {
    const png = writePngLabel(makePng(2, 2), buildXmp(aigcJson(info)), aigcJson(info, true));
    const r = await inspect(png);
    expect(r).toMatchObject({ format: 'png', where: ['XMP', 'PNG 文字块 AIGC'] });
    expect(r.info?.ContentProducer).toBe('示例科技');
  });
  it('PNG：只有平台写的 AIGC 文字块也算', async () => {
    const r = await inspect(makePng(2, 2, undefined, [tEXt('AIGC', '{"Label":"1","ContentProducer":"001"}')]));
    expect(r.where).toEqual(['PNG 文字块 AIGC']);
  });
  it('JPG：XMP 和 EXIF 里的 JSON 都能找到', async () => {
    const exif = seg(0xe1, concat([latin1('Exif\0\0'), utf8('xx{"AIGC":{"Label":"1","ProduceID":"E1"}}yy')]));
    const r = await inspect(writeJpegXmp(makeJpeg([exif]), buildXmp(aigcJson(info))));
    expect(r.where).toEqual(['XMP', 'EXIF']);
    expect(r.info?.ProduceID).toBe('X-1');
  });
  it('没有标识时 info 为 null', async () => {
    expect(await inspect(makePng(2, 2))).toEqual({ format: 'png', info: null, where: [] });
    expect((await inspect(makeJpeg())).info).toBeNull();
  });
  it('WebP 在文件里找 XMP', async () => {
    const webp = concat([latin1('RIFF\0\0\0\0WEBPVP8X'), utf8(buildXmp(aigcJson(info)))]);
    expect(detectFormat(webp)).toBe('webp');
    expect((await inspect(webp)).info?.ProduceID).toBe('X-1');
  });
});

describe('内容编号', () => {
  it('前缀 + 日期 + 摘要前 12 位', () => {
    expect(makeProduceId('SHOP-', new Date(2026, 9, 3), 'abcdef0123456789')).toBe('SHOP-20261003-abcdef012345');
  });
});

describe('角标布局', () => {
  it('右下角，字高按短边比例', () => {
    const b = badgeLayout(1000, 800, 300, 'br', 0.07);
    expect(b.font).toBe(56);
    expect(b.x + b.w).toBe(1000 - 20);
    expect(b.y + b.h).toBe(800 - 20);
  });
  it('左上角', () => {
    const b = badgeLayout(1000, 800, 300, 'tl', 0.05);
    expect([b.x, b.y, b.font]).toEqual([20, 20, 40]);
  });
  it('小图字高不低于 12 像素和短边 3%', () => {
    expect(minFontPx(200, 200)).toBe(12);
    expect(minFontPx(2000, 3000)).toBe(60);
    expect(badgeLayout(200, 200, 300, 'br', 0.05).font).toBe(12);
  });
  it('文字太长时缩小字号，但不低于最小值，放不下就报错', () => {
    const b = badgeLayout(1000, 1000, 1200, 'br', 0.1);
    expect(b.font).toBeLessThan(100);
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(() => badgeLayout(120, 120, 2000, 'br', 0.1)).toThrow('放不下清晰可辨的标识文字');
  });
});

describe('其他', () => {
  it('角标文字检查', () => {
    expect(checkLabelText('  AI生成 ')).toBe('AI生成');
    expect(() => checkLabelText('')).toThrow('不能为空');
    expect(() => checkLabelText('一'.repeat(21))).toThrow('太长');
  });
  it('输出文件名：WebP 转成 PNG', () => {
    expect(outputName('海报.webp', 'webp')).toBe('海报.png');
    expect(outputName('海报.JPG', 'jpg')).toBe('海报.JPG');
  });
  it('CSV 带 BOM 并转义', () => {
    expect(toCsv(['a', 'b'], [['x,y', '"q"']])).toBe('﻿a,b\r\n"x,y","""q"""\r\n');
  });
});
