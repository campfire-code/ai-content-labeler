// 工具声明：AI 内容标识器（在本机完成，不联网）。
import { Stamp as StampAsIcon } from 'lucide-react';
import type { BatchTool, Params, RunContext } from '../kit/types';
import { AIGC_FIELDS, aigcJson, buildAigc, upsertXmp, type AigcInfo } from './aigc';
import { drawLabel, type BadgeStyle } from './canvas';
import { SIZE_RATIO, checkLabelText, detectFormat, inspect, makeProduceId, outputName, toCsv, type Corner } from './core';
import { readJpegXmp, writeJpegXmp } from './jpeg';
import { readPngXmp, writePngLabel } from './png';

const isLabel = (p: Params) => p.action === 'label';
const withExplicit = (p: Params) => isLabel(p) && p.explicit === true;

async function sha256Hex(b: Uint8Array) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', b as BufferSource));
  return Array.from(d, (x) => x.toString(16).padStart(2, '0')).join('');
}

/** 每个文件的结果数据，供导出清单使用 */
interface RowData {
  found: boolean;
  where: string[];
  info: Partial<AigcInfo> | null;
  output?: string;
  kept?: boolean;
}

const CORNER_TEXT: Record<string, string> = { tl: '左上', tr: '右上', bl: '左下', br: '右下' };

const tool: BatchTool = {
  id: 'c23',
  name: 'AI 内容标识器',
  tagline: '依据《人工智能生成合成内容标识办法》，给 AI 生成的图片加上「AI生成」角标（显式标识），并把 AIGC 标记、生成服务提供者、内容编号写进文件元数据（隐式标识）；也能批量检查图片里有没有这些元数据。',
  icon: StampAsIcon,
  category: '内容生产',
  type: 'media',
  mode: 'batch',
  resultView: 'list',
  concurrency: 2,
  accept: { label: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
  params: [
    { key: 'action', label: '要做什么', type: 'segment', options: [['label', '加标识'], ['check', '检查已有标识']], default: 'label', help: '检查只读取元数据，不修改图片' },
    { key: 'explicit', label: '加显式标识（角标文字）', type: 'toggle', default: true, when: isLabel, help: '关闭后只写元数据，图片画面和画质完全不变' },
    { key: 'text', label: '角标文字', type: 'text', default: 'AI生成', placeholder: '例如 AI生成、由人工智能生成', when: withExplicit },
    { key: 'corner', label: '位置', type: 'segment', options: [['tl', '左上'], ['tr', '右上'], ['bl', '左下'], ['br', '右下']], default: 'br', when: withExplicit },
    { key: 'size', label: '文字大小', type: 'segment', options: [['s', '小'], ['m', '中'], ['l', '大']], default: 'm', when: withExplicit, help: '按图片短边的 5% / 7% / 10% 计算，最小不低于短边的 3% 且不小于 12 像素' },
    { key: 'style', label: '颜色', type: 'segment', options: [['dark', '白字深底'], ['light', '黑字浅底'], ['outline', '白字黑边']], default: 'dark', when: withExplicit },
    { key: 'producer', label: '生成服务提供者', type: 'text', default: '', placeholder: '生成这张图的 AI 服务提供者名称或编码', when: isLabel, help: '写入元数据的 ContentProducer 字段，必填' },
    { key: 'idPrefix', label: '内容编号前缀', type: 'text', default: '', placeholder: '选填，例如 SHOP-', when: isLabel, help: '内容编号 = 前缀 + 日期 + 文件摘要，同一张图编号固定' },
    { key: 'propagator', label: '传播服务提供者', type: 'text', default: '', placeholder: '选填，例如发布平台或你的公司名称', when: isLabel, help: '写入 ContentPropagator 字段' },
    { key: 'existing', label: '图片里已有隐式标识时', type: 'segment', options: [['keep', '保留原有'], ['replace', '用新填的替换']], default: 'keep', when: isLabel, help: 'AI 平台导出的图片常常已带标识，默认保留原生成方信息' },
    { key: 'out', label: '保存到', type: 'folder', default: '', when: isLabel },
  ],
  exportAll: async (results, ctx) => {
    const label = isLabel(ctx.params);
    const header = ['文件', label ? '标识结果' : '是否有隐式标识', '标识位置', ...AIGC_FIELDS, ...(label ? ['输出文件'] : [])];
    const rows = results.map(({ item, result }) => {
      const d = result.data as RowData;
      const status = label ? (d.kept ? '保留原有隐式标识' : '已写入新的隐式标识') : d.found ? '有' : '没有';
      return [item.name, status, d.where.join('、'), ...AIGC_FIELDS.map((f) => d.info?.[f] ?? ''), ...(label ? [d.output ?? ''] : [])];
    });
    const path = await ctx.join(ctx.outputDir, label ? 'AIGC标识清单.csv' : 'AIGC标识检查报告.csv');
    await ctx.writeText(path, toCsv(header, rows));
    return path;
  },
  exportLabel: '导出清单（CSV）',
  check: (item) => (item.size != null && item.size > 100 * 1024 * 1024 ? '图片超过 100 MB，请先缩小后再处理' : null),

  async run(item, ctx: RunContext) {
    const p = ctx.params;
    const src = await ctx.readFile(item.path!);
    const format = detectFormat(src);
    if (format === 'other') throw new Error('不是有效的 PNG / JPG / WebP 图片，可能已损坏或扩展名不对');
    const before = await inspect(src);

    if (!isLabel(p)) {
      const data: RowData = { found: !!before.info, where: before.where, info: before.info };
      if (!before.info) return { summary: '没有找到 AIGC 隐式标识', data };
      const i = before.info;
      const who = i.ContentProducer ? `生成方 ${i.ContentProducer}` : '未写生成方';
      return { summary: `有隐式标识：${who}${i.ProduceID ? `，内容编号 ${i.ProduceID}` : ''}（位置：${before.where.join('、')}）`, data };
    }

    // 加标识
    const keep = p.existing !== 'replace' && !!before.info?.ContentProducer;
    let info: AigcInfo;
    if (keep) {
      info = Object.fromEntries(AIGC_FIELDS.map((f) => [f, before.info?.[f] ?? ''])) as AigcInfo;
    } else {
      if (!String(p.producer ?? '').trim()) throw new Error('请先在「生成服务提供者」里填写生成这张图的 AI 服务提供者名称或编码');
      info = buildAigc({
        producer: String(p.producer),
        produceId: makeProduceId(String(p.idPrefix ?? ''), new Date(), await sha256Hex(src)),
        propagator: String(p.propagator ?? ''),
      });
    }
    ctx.progress(0.2);

    const outFormat = format === 'jpg' ? 'jpg' : 'png';
    let data = src;
    let badgeNote = '';
    if (p.explicit === true || format === 'webp') {
      const text = p.explicit === true ? checkLabelText(String(p.text ?? '')) : '';
      const r = await drawLabel(src, { text, corner: p.corner as Corner, ratio: SIZE_RATIO[String(p.size)] ?? SIZE_RATIO.m, style: p.style as BadgeStyle, format: outFormat });
      data = r.data;
      if (r.badge) badgeNote = ` + 角标「${text}」（${CORNER_TEXT[String(p.corner)] ?? ''}，字高 ${r.badge.font} 像素）`;
    }
    ctx.progress(0.7);

    const json = aigcJson(info);
    let out: Uint8Array;
    if (outFormat === 'png') out = writePngLabel(data, upsertXmp(await readPngXmp(data), json), aigcJson(info, true));
    else out = writeJpegXmp(data, upsertXmp(readJpegXmp(data), json));

    // 写完立刻读回校验
    const after = await inspect(out);
    if (after.info?.ProduceID !== info.ProduceID || after.info?.ContentProducer !== info.ContentProducer) throw new Error('写入后读回的元数据不一致，没有保存。请把这张图反馈给我们');

    const outputPath = await ctx.join(ctx.outputDir, outputName(item.name, format));
    if (outputPath === item.path) throw new Error('「保存到」的文件夹就是原图所在的文件夹，会覆盖原图。请换一个保存位置');
    await ctx.writeFile(outputPath, out);
    // 列表里摘要会被截断，最重要的放前面
    const implicit = keep ? '已加标识：保留原有隐式标识' : '已加标识：隐式标识';
    const detail = keep ? ` · 原生成方 ${info.ContentProducer}` : ` · 编号 ${info.ProduceID}`;
    const webp = format === 'webp' ? '；WebP 已转存为 PNG' : '';
    return {
      outputPath,
      preview: outputPath,
      summary: `${implicit}${badgeNote}${detail}${webp}`,
      data: { found: true, where: after.where, info, output: outputPath, kept: keep } satisfies RowData,
    };
  },
};

export default tool;
