// 生成 samples/ 里的示例图片（只在设置了 MAKE_SAMPLES=1 时运行；JPG 用 macOS 自带的 sips 转换）
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { aigcJson, buildAigc, buildXmp } from './aigc';
import { concat } from './bytes';
import { makeChunk, PNG_SIG, writePngLabel } from './png';

/** 一张带渐变和圆形的示例「AI 海报」 */
function poster(w: number, h: number, hue: number) {
  const raw = new Uint8Array((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * (w * 4 + 1) + 1 + x * 4;
      const d = Math.hypot(x - w * 0.6, y - h * 0.45) / Math.min(w, h);
      const sun = d < 0.22;
      const t = y / h;
      raw[i] = sun ? 255 : Math.round(40 + 120 * t + hue * 0.2);
      raw[i + 1] = sun ? 200 : Math.round(60 + 60 * t);
      raw[i + 2] = sun ? 90 : Math.round(140 - 60 * t + hue * 0.3);
      raw[i + 3] = 255;
    }
  }
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, w); v.setUint32(4, h); ihdr[8] = 8; ihdr[9] = 6;
  return concat([PNG_SIG, makeChunk('IHDR', ihdr), makeChunk('IDAT', deflateSync(raw)), makeChunk('IEND', new Uint8Array())]);
}

it.runIf(process.env.MAKE_SAMPLES === '1')('生成示例图片', () => {
  writeFileSync('samples/AI海报.png', poster(1200, 800, 40));
  writeFileSync('samples/tmp.png', poster(1000, 1000, 160));
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '90', 'samples/tmp.png', '--out', 'samples/AI插画.jpg']);
  execFileSync('rm', ['samples/tmp.png']);
  const info = buildAigc({ producer: '示例AI平台', produceId: 'DEMO-0001' });
  writeFileSync('samples/平台已标识.png', writePngLabel(poster(800, 800, 90), buildXmp(aigcJson(info)), aigcJson(info, true)));
  writeFileSync('samples/不是图片.png', '这是一段文字，不是图片');
});
