// 空状态：画出「一张 AI 配图 → 右下角多一个角标，文件里多一份编号」，再讲清两层标识
import { Eye, FileSearch, Upload } from 'lucide-react';
import './tool.css';

function Photo({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="8" className="lb-photo" />
      <circle cx={x + w * 0.74} cy={y + h * 0.27} r={h * 0.1} className="lb-sun" />
      <path d={`M${x} ${y + h * 0.8} L${x + w * 0.32} ${y + h * 0.42} L${x + w * 0.55} ${y + h * 0.68} L${x + w * 0.7} ${y + h * 0.55} L${x + w} ${y + h * 0.82} V${y + h - 8} Q${x + w} ${y + h} ${x + w - 8} ${y + h} H${x + 8} Q${x} ${y + h} ${x} ${y + h - 8} Z`} className="lb-hill" />
    </g>
  );
}

export function Empty({ hover }: { hover: boolean }) {
  return (
    <div className="lb-empty">
      <svg viewBox="0 0 460 170" role="img" aria-label="一张 AI 生成的图片，右下角多了「AI生成」角标，文件里多了生成服务提供者和内容编号">
        <Photo x={8} y={20} w={150} h={112} />
        <text x="83" y="154" textAnchor="middle" className="lb-cap muted">原图</text>
        <path d="M174 76 H208 M199 67 L210 76 L199 85" className="lb-arrow" />
        <Photo x={226} y={20} w={150} h={112} />
        <rect x="294" y="106" width="76" height="22" rx="5" className="lb-badge" />
        <text x="332" y="121" textAnchor="middle" className="lb-badge-t">AI生成</text>
        <text x="301" y="154" textAnchor="middle" className="lb-cap">画面上：显式标识</text>
        <g className="lb-meta">
          <rect x="386" y="20" width="68" height="112" rx="8" />
          <text x="420" y="42" textAnchor="middle" className="lb-meta-h">文件里</text>
          <rect x="396" y="54" width="48" height="6" rx="3" /><rect x="396" y="70" width="36" height="6" rx="3" />
          <rect x="396" y="86" width="44" height="6" rx="3" /><rect x="396" y="102" width="30" height="6" rx="3" />
        </g>
        <text x="420" y="154" textAnchor="middle" className="lb-cap">隐式标识</text>
      </svg>
      <ul className="lb-points">
        <li><Eye size={16} /><b>显式标识</b><span>在画面一角加「AI生成」，字高按图片大小算，小图放不下会提示</span></li>
        <li><FileSearch size={16} /><b>隐式标识</b><span>把生成方、内容编号写进文件元数据，同一张图编号固定</span></li>
        <li><Upload size={16} /><b>检查已有</b><span>切到「检查已有标识」，批量看哪些图没带标识</span></li>
      </ul>
      <h2 className="lb-title">{hover ? '松开鼠标，开始添加' : '把 AI 生成的图片拖进来'}</h2>
      <p className="lb-act">支持 PNG、JPG、WebP，可多张或整个文件夹；结果存到新文件夹，原图不动</p>
    </div>
  );
}
