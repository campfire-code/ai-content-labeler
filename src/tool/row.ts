// 每个文件的结果数据（放在 ItemResult.data 里），导出清单和结果展示都用它。
import type { AigcInfo } from './aigc';

export interface RowData {
  found: boolean;
  where: string[];
  info: Partial<AigcInfo> | null;
  output?: string;
  kept?: boolean;
  /** 画在图上的角标（没加角标时为空） */
  badge?: { text: string; corner: string; font: number };
}
