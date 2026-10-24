// 单张图的结果：左边是图（加了角标的成品），右边是一张「标识档案」，写清画面上和文件里各有什么
import { BadgeCheck, CircleSlash, Eye, FileSearch, ShieldCheck } from 'lucide-react';
import type { InputItem, ItemResult } from '../kit/types';
import { fileSrc } from '../kit/platform';
import type { RowData } from './row';
import './tool.css';

const CORNER: Record<string, string> = { tl: '左上角', tr: '右上角', bl: '左下角', br: '右下角' };

const where = (w: string) => (w === 'XMP' ? '附加信息区' : w.startsWith('PNG 文字块') ? 'PNG 文字块' : w);

export function ResultBody({ item, result }: { item: InputItem; result: ItemResult }) {
  const d = result.data as RowData | undefined;
  const src = result.preview ?? item.path;
  const labeled = !!d?.output;
  const info = d?.info ?? null;
  const found = !!d?.found;
  const tone = found ? 'ok' : 'warn';
  const rows: [string, string | undefined][] = [
    ['生成服务提供者', info?.ContentProducer],
    ['传播服务提供者', info?.ContentPropagator],
  ];
  return (
    <div className="lb-res">
      {src && (
        <figure className="lb-pic">
          <img src={fileSrc(src)} alt={labeled ? '加好标识的图片' : '待检查的图片'} />
          <figcaption className={`lb-state ${tone}`}>{labeled ? <BadgeCheck size={14} /> : found ? <ShieldCheck size={14} /> : <CircleSlash size={14} />}{labeled ? (d?.kept ? '保留原有标识' : '已加标识') : found ? '带有标识' : '没有标识'}</figcaption>
        </figure>
      )}
      <div className="lb-doc">
        {labeled && (
          <section>
            <h4><Eye size={14} />画面上</h4>
            {d?.badge
              ? <p className="lb-badge-line"><span className="lb-chip">{d.badge.text}</span><span>{CORNER[d.badge.corner] ?? ''} · 字高 <b className="k-num">{d.badge.font}</b> 像素</span></p>
              : <p className="k-muted">没有加角标，画面一个像素都没变</p>}
          </section>
        )}
        <section>
          <h4><FileSearch size={14} />文件里</h4>
          {found ? (
            <>
              <p className="lb-id k-num" title="内容编号">{info?.ProduceID || '未写内容编号'}</p>
              <dl>
                {rows.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
                {!!d?.where.length && <div><dt>写在</dt><dd className="lb-where">{[...new Set(d.where.map(where))].map((w) => <span key={w} className="lb-chip soft">{w}</span>)}</dd></div>}
              </dl>
            </>
          ) : (
            <p className="k-muted">元数据里没有找到 AI 生成标识。画面上有没有角标，这里看不出来</p>
          )}
        </section>
      </div>
    </div>
  );
}
