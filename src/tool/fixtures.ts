// 测试与示例用：在 Node 里生成真实可用的 PNG，以及结构合法的最小 JPG（不进入正式运行）。
import { deflateSync } from 'node:zlib';
import { concat, latin1 } from './bytes';
import { makeChunk, PNG_SIG } from './png';

/** 纯色 PNG（RGBA） */
export function makePng(w: number, h: number, rgba: [number, number, number, number] = [80, 140, 200, 255], extra: Uint8Array[] = []) {
  const raw = new Uint8Array((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(rgba, y * (w * 4 + 1) + 1 + x * 4);
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, w); v.setUint32(4, h); ihdr[8] = 8; ihdr[9] = 6;
  return concat([PNG_SIG, makeChunk('IHDR', ihdr), ...extra, makeChunk('IDAT', deflateSync(raw)), makeChunk('IEND', new Uint8Array())]);
}

export function seg(marker: number, payload: Uint8Array) {
  const s = new Uint8Array(4 + payload.length);
  s[0] = 0xff; s[1] = marker; s[2] = (payload.length + 2) >> 8; s[3] = (payload.length + 2) & 0xff;
  s.set(payload, 4);
  return s;
}

/** 段结构合法的最小 JPG：SOI + 给定段 + DQT + SOS + 假数据 + EOI（只用于测元数据读写，不能解码成图） */
export function makeJpeg(segments: Uint8Array[] = []) {
  const app0 = seg(0xe0, concat([latin1('JFIF\0'), new Uint8Array([1, 1, 0, 0, 1, 0, 1, 0, 0])]));
  const dqt = seg(0xdb, new Uint8Array(65));
  const sos = seg(0xda, new Uint8Array([1, 1, 0, 0, 63, 0]));
  return concat([new Uint8Array([0xff, 0xd8]), app0, ...segments, dqt, sos, new Uint8Array([0x12, 0x34, 0xff, 0x00, 0x56]), new Uint8Array([0xff, 0xd9])]);
}
