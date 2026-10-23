// 画布部分：在图片角落画显式标识并重新编码（兼容 macOS 11 起的系统网页引擎与 Windows WebView2，不用 OffscreenCanvas）。
// 这部分在 node 测试环境里跑不了，由 selftest.html 在浏览器里验证。
import { badgeLayout, type Corner } from './core';

export const FONT_FAMILY = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC",sans-serif';
export type BadgeStyle = 'dark' | 'light' | 'outline';

export interface DrawOptions {
  text: string;
  corner: Corner;
  ratio: number;
  style: BadgeStyle;
  /** 输出 JPG 还是 PNG */
  format: 'jpg' | 'png';
}

export async function drawLabel(bytes: Uint8Array, o: DrawOptions) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart]));
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode().catch(() => {
      throw new Error('无法识别这张图片，可能已损坏或格式不受支持（支持 PNG、JPG、WebP）');
    });
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext('2d')!;
    if (o.format === 'jpg') {
      g.fillStyle = '#FFFFFF';
      g.fillRect(0, 0, w, h);
    }
    g.drawImage(img, 0, 0);
    const b = o.text ? drawBadge(g, w, h, o) : null;
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, o.format === 'jpg' ? 'image/jpeg' : 'image/png', o.format === 'jpg' ? 0.92 : undefined));
    if (!blob) throw new Error('编码失败，可能是图片太大、电脑内存不够，请关掉其他程序后重试');
    return { data: new Uint8Array(await blob.arrayBuffer()), w, h, badge: b };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 在角落画标识文字（text 为空时只转码不画） */
function drawBadge(g: CanvasRenderingContext2D, w: number, h: number, o: DrawOptions) {
  g.font = `bold 100px ${FONT_FAMILY}`;
  const b = badgeLayout(w, h, g.measureText(o.text).width, o.corner, o.ratio);
  g.font = `bold ${b.font}px ${FONT_FAMILY}`;
  g.textBaseline = 'middle';
  if (o.style !== 'outline') {
    g.fillStyle = o.style === 'dark' ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.85)';
    const r = Math.round(b.h * 0.2);
    g.beginPath();
    g.moveTo(b.x + r, b.y);
    g.arcTo(b.x + b.w, b.y, b.x + b.w, b.y + b.h, r);
    g.arcTo(b.x + b.w, b.y + b.h, b.x, b.y + b.h, r);
    g.arcTo(b.x, b.y + b.h, b.x, b.y, r);
    g.arcTo(b.x, b.y, b.x + b.w, b.y, r);
    g.closePath();
    g.fill();
  } else {
    g.lineJoin = 'round';
    g.lineWidth = Math.max(2, Math.round(b.font * 0.14));
    g.strokeStyle = 'rgba(0,0,0,0.85)';
    g.strokeText(o.text, b.tx, b.ty);
  }
  g.fillStyle = o.style === 'light' ? '#111111' : '#FFFFFF';
  g.fillText(o.text, b.tx, b.ty);
  return b;
}
