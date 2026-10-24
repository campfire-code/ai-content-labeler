// 截图与预览用的示例数据（不会进入正式运行）
import type { Row } from '../kit/runner';
import type { RowData } from './row';

const img = (n: string) => new URL(`../../samples/${n}`, import.meta.url).href;
const files: [string, string, number, Row['status'], string?][] = [
  ['春季新品海报.png', 'AI海报.png', 1_240_000, 'ok', '已加标识：隐式标识 + 角标「AI生成」（右下，字高 56 像素） · 编号 春季-20261023-772310635581'],
  ['公众号头图.jpg', 'AI插画.jpg', 860_000, 'ok', '已加标识：隐式标识 + 角标「AI生成」（右下，字高 70 像素） · 编号 春季-20261023-406135498204'],
  ['平台导出-01.png', '平台已标识.png', 920_000, 'ok', '已加标识：保留原有隐式标识 + 角标「AI生成」（右下，字高 56 像素） · 原生成方 示例AI平台'],
  ['详情页插图.jpg', 'AI插画.jpg', 1_530_000, 'run'],
  ['朋友圈配图.webp', 'AI海报.png', 410_000, 'wait'],
  ['说明文档.png', 'AI海报.png', 33, 'err', '不是有效的 PNG / JPG / WebP 图片，可能已损坏或扩展名不对'],
];

function dataOf(text: string): RowData {
  const kept = text.includes('保留原有');
  const id = /编号 (\S+)/.exec(text)?.[1] ?? '';
  const font = Number(/字高 (\d+)/.exec(text)?.[1] ?? 56);
  return {
    found: true,
    // check-zh: 忽略（与读取结果里的位置名一致，界面上会转成中文）
    where: ['XMP', 'PNG 文字块 AIGC'],
    info: kept ? { ContentProducer: '示例AI平台', ProduceID: 'DEMO-0001', ContentPropagator: '' } : { ContentProducer: '示例科技有限公司', ProduceID: id, ContentPropagator: '示例科技有限公司官方旗舰店' },
    output: '/示例/输出',
    kept,
    badge: { text: 'AI生成', corner: 'br', font },
  };
}

export const rows = (state: string): Row[] =>
  state === 'empty' ? [] : files.map(([name, sample, size, status, text], i) => {
    const st = state === 'done' && status !== 'err' ? 'ok' : status;
    return {
      item: { id: `p${i}`, name, path: img(sample), size },
      status: st,
      progress: st === 'run' ? 0.45 : st === 'ok' ? 1 : 0,
      error: st === 'err' ? text : undefined,
      result: st === 'ok' ? { summary: text ?? '已加标识：隐式标识 + 角标「AI生成」', outputPath: '/示例/输出', preview: img(sample), data: dataOf(text ?? '') } : undefined,
    };
  });

export const params = { producer: '示例科技有限公司', idPrefix: 'SHOP-' };
