// 隐式标识的内容：TC260 AIGC 七个字段的 JSON，以及 XMP 包的生成与读取。
//
// 字段名与 XMP 命名空间按多个开源实现与 AI 平台实际输出图片中的写法（据称依据 GB 45438-2025 附录），
// 我们没能直接核对标准原文，详见 README。

export const TC260_NS = 'http://www.tc260.org.cn/ns/AIGC/1.0/';
export const AIGC_FIELDS = ['Label', 'ContentProducer', 'ProduceID', 'ReservedCode1', 'ContentPropagator', 'PropagateID', 'ReservedCode2'] as const;
export type AigcInfo = Record<(typeof AIGC_FIELDS)[number], string>;

export interface LabelInput {
  producer: string;
  produceId: string;
  propagator?: string;
  propagateId?: string;
}

export function buildAigc(i: LabelInput): AigcInfo {
  return {
    Label: '1',
    ContentProducer: i.producer.trim(),
    ProduceID: i.produceId.trim(),
    ReservedCode1: '',
    ContentPropagator: (i.propagator ?? '').trim(),
    PropagateID: (i.propagateId ?? '').trim(),
    ReservedCode2: '',
  };
}

/** JSON 文本。ascii=true 时把非 ASCII 字符写成 \uXXXX（PNG tEXt 只能放 Latin-1） */
export function aigcJson(info: AigcInfo, ascii = false) {
  const s = JSON.stringify(info);
  return ascii ? s.replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')) : s;
}

/** 解析 AIGC JSON，兼容外面再包一层 {"AIGC": {...}} 的写法；不是 AIGC 内容返回 null */
export function parseAigc(text: string): Partial<AigcInfo> | null {
  const t = text.trim();
  if (!t.startsWith('{')) return null;
  try {
    let v = JSON.parse(t);
    if (v && typeof v === 'object' && v.AIGC && typeof v.AIGC === 'object') v = v.AIGC;
    if (!v || typeof v !== 'object' || !AIGC_FIELDS.some((f) => f in v)) return null;
    const out: Partial<AigcInfo> = {};
    for (const f of AIGC_FIELDS) if (v[f] != null) out[f] = String(v[f]);
    return out;
  } catch {
    return null;
  }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&');

const description = (json: string) => `<rdf:Description rdf:about="" xmlns:TC260="${TC260_NS}"><TC260:AIGC>${esc(json)}</TC260:AIGC></rdf:Description>`;

/** 新建一个只含 AIGC 标识的 XMP 包 */
export function buildXmp(json: string) {
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">${description(json)}</rdf:RDF></x:xmpmeta>\n<?xpacket end="w"?>`;
}

const ELEMENT = /<(\w+):AIGC(?:\s[^>]*)?>([\s\S]*?)<\/\1:AIGC>/;
const ATTR = /\s(\w+):AIGC\s*=\s*(?:"([^"]*)"|'([^']*)')/;

/** 从 XMP 文本里取出 AIGC JSON（元素写法或属性写法都认） */
export function extractAigcFromXmp(xmp: string): string | null {
  if (!xmp.includes(':AIGC')) return null;
  const e = ELEMENT.exec(xmp);
  if (e) return unesc(e[2]);
  const a = ATTR.exec(xmp);
  if (a) return unesc(a[2] ?? a[3] ?? '');
  return null;
}

/** 在已有 XMP 里写入（替换）AIGC 标识，保留其他内容；已有内容不是正常 XMP 时新建 */
export function upsertXmp(existing: string | null, json: string) {
  if (!existing || !existing.includes('</rdf:RDF>')) return buildXmp(json);
  const cleaned = existing.replace(new RegExp(ELEMENT.source, 'g'), '').replace(new RegExp(ATTR.source, 'g'), '');
  const i = cleaned.lastIndexOf('</rdf:RDF>');
  return cleaned.slice(0, i) + description(json) + cleaned.slice(i);
}
