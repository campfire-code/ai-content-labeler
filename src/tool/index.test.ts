import { describe, expect, it, vi } from 'vitest';
import type { InputItem, ItemResult, Params, RunContext } from '../kit/types';
import { aigcJson, buildAigc, buildXmp } from './aigc';
import { inspect } from './core';
import { makeJpeg, makePng } from './fixtures';
import { readChunks, tEXt, writePngLabel } from './png';
import { readSegments } from './jpeg';

// 画布在 node 里跑不了：假的 drawLabel 返回一张新的 PNG（或原样 JPG），并记录调用参数
const calls: unknown[] = [];
vi.mock('./canvas', () => ({
  drawLabel: async (bytes: Uint8Array, o: { text: string; format: string }) => {
    calls.push(o);
    const data = o.format === 'png' ? makePng(8, 8, [1, 2, 3, 255]) : bytes;
    return { data, w: 8, h: 8, badge: o.text ? { font: 40, x: 0, y: 0, w: 10, h: 10, tx: 0, ty: 0 } : null };
  },
}));
const { default: tool } = await import('./index');

function fakeCtx(files: Map<string, Uint8Array>, params: Params): RunContext {
  return {
    params, outputDir: '/out', signal: new AbortController().signal, progress: () => {},
    readFile: async (p) => files.get(p)!,
    readText: async (p) => new TextDecoder().decode(files.get(p)!),
    writeFile: async (p, d) => void files.set(p, d),
    writeText: async (p, t) => void files.set(p, new TextEncoder().encode(t)),
    mkdir: async () => {},
    join: async (...parts) => parts.join('/'),
    llm: async () => '', sidecar: async () => '', ffmpeg: async () => {}, duration: async () => 0,
  };
}
const defaults = (over: Params): Params => ({ ...Object.fromEntries(tool.params.map((f) => [f.key, f.default])), ...over });
const item = (name: string, dir = '/in'): InputItem => ({ id: name, name, path: `${dir}/${name}` });

describe('加标识', () => {
  it('PNG：加角标 + 写入 XMP 和 AIGC 文字块，能读回', async () => {
    calls.length = 0;
    const files = new Map([['/in/海报.png', makePng(8, 8)]]);
    const r = await tool.run(item('海报.png'), fakeCtx(files, defaults({ producer: '示例科技有限公司', idPrefix: 'S-', propagator: '某店铺' })));
    expect(calls[0]).toMatchObject({ text: 'AI生成', corner: 'br', ratio: 0.07, style: 'dark', format: 'png' });
    const out = await inspect(files.get('/out/海报.png')!);
    expect(out.where).toEqual(['XMP', 'PNG 文字块 AIGC']);
    expect(out.info).toMatchObject({ Label: '1', ContentProducer: '示例科技有限公司', ContentPropagator: '某店铺' });
    expect(out.info?.ProduceID).toMatch(/^S-\d{8}-[0-9a-f]{12}$/);
    expect(r.summary).toMatch(/^已加标识：隐式标识 \+ 角标「AI生成」（右下，字高 40 像素） · 编号 S-\d{8}-[0-9a-f]{12}$/);
  });

  it('JPG 只加隐式标识：不重新编码，图像数据一字节不变', async () => {
    calls.length = 0;
    const src = makeJpeg();
    const files = new Map([['/in/a.jpg', src]]);
    await tool.run(item('a.jpg'), fakeCtx(files, defaults({ explicit: false, producer: '示例科技' })));
    expect(calls).toHaveLength(0);
    const out = files.get('/out/a.jpg')!;
    expect(out.subarray(readSegments(out).bodyStart)).toEqual(src.subarray(readSegments(src).bodyStart));
    expect((await inspect(out)).info?.ContentProducer).toBe('示例科技');
  });

  it('同一张图两次生成的内容编号相同', async () => {
    const files = new Map([['/in/a.png', makePng(4, 4)]]);
    const ctx = fakeCtx(files, defaults({ explicit: false, producer: 'P' }));
    await tool.run(item('a.png'), ctx);
    const id1 = (await inspect(files.get('/out/a.png')!)).info?.ProduceID;
    await tool.run(item('a.png'), ctx);
    expect((await inspect(files.get('/out/a.png')!)).info?.ProduceID).toBe(id1);
  });

  it('已有隐式标识时默认保留原生成方，选「替换」时改成新填的', async () => {
    const old = buildAigc({ producer: '原平台', produceId: 'OLD-1' });
    const src = makePng(4, 4, undefined, [tEXt('AIGC', aigcJson(old, true))]);
    const files = new Map([['/in/b.png', src]]);
    const r = await tool.run(item('b.png'), fakeCtx(files, defaults({ explicit: false, producer: '' })));
    expect(r.summary).toBe('已加标识：保留原有隐式标识 · 原生成方 原平台');
    expect((await inspect(files.get('/out/b.png')!)).info?.ProduceID).toBe('OLD-1');
    await tool.run(item('b.png'), fakeCtx(files, defaults({ explicit: false, producer: '新平台', existing: 'replace' })));
    const after = await inspect(files.get('/out/b.png')!);
    expect(after.info?.ContentProducer).toBe('新平台');
    expect(readChunks(files.get('/out/b.png')!).filter((c) => c.type === 'tEXt')).toHaveLength(1);
  });

  it('WebP 转存为 PNG', async () => {
    const webp = new Uint8Array([...new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '), 0, 0]);
    const files = new Map([['/in/c.webp', webp]]);
    const r = await tool.run(item('c.webp'), fakeCtx(files, defaults({ explicit: false, producer: 'P' })));
    expect(r.outputPath).toBe('/out/c.png');
    expect(r.summary).toContain('WebP 已转存为 PNG');
  });

  it('没填生成服务提供者、文字为空、会覆盖原图、不是图片时说明原因', async () => {
    const files = new Map([['/in/a.png', makePng(4, 4)], ['/out/x.png', makePng(4, 4)], ['/in/t.png', new TextEncoder().encode('hello')]]);
    await expect(tool.run(item('a.png'), fakeCtx(files, defaults({})))).rejects.toThrow('请先在「生成服务提供者」里填写');
    await expect(tool.run(item('a.png'), fakeCtx(files, defaults({ producer: 'P', text: ' ' })))).rejects.toThrow('不能为空');
    await expect(tool.run(item('x.png', '/out'), fakeCtx(files, defaults({ producer: 'P' })))).rejects.toThrow('会覆盖原图');
    await expect(tool.run(item('t.png'), fakeCtx(files, defaults({ producer: 'P' })))).rejects.toThrow('不是有效的 PNG / JPG / WebP 图片');
  });
});

describe('检查已有标识 + 导出清单', () => {
  it('批量检查并导出 CSV 报告', async () => {
    const info = buildAigc({ producer: '示例科技', produceId: 'ID-9' });
    const files = new Map([
      ['/in/有.png', writePngLabel(makePng(2, 2), buildXmp(aigcJson(info)), aigcJson(info, true))],
      ['/in/无.jpg', makeJpeg()],
    ]);
    const ctx = fakeCtx(files, defaults({ action: 'check' }));
    const results: { item: InputItem; result: ItemResult }[] = [];
    for (const n of ['有.png', '无.jpg']) results.push({ item: item(n), result: await tool.run(item(n), ctx) });
    expect(results[0].result.summary).toBe('有隐式标识：生成方 示例科技，内容编号 ID-9（位置：XMP、PNG 文字块 AIGC）');
    expect(results[1].result.summary).toBe('没有找到 AIGC 隐式标识');
    expect([...files.keys()].some((k) => k.startsWith('/out/') && !k.endsWith('.csv'))).toBe(false);
    const path = await tool.exportAll!(results, ctx);
    expect(path).toBe('/out/AIGC标识检查报告.csv');
    const csv = new TextDecoder().decode(files.get(path)!);
    expect(csv).toContain('文件,是否有隐式标识,标识位置,Label,ContentProducer,ProduceID');
    expect(csv).toContain('有.png,有,XMP、PNG 文字块 AIGC,1,示例科技,ID-9');
    expect(csv).toContain('无.jpg,没有,');
  });
});
