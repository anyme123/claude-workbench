/**
 * ✅ Read Widget - 文件读取展示
 *
 * 迁移自 ToolWidgets.tsx (原 422-469 行)
 * 用于展示文件读取操作和结果
 */

import React from "react";
import { ReadResultWidget } from './ReadResultWidget';
import { Loader2, FileText } from "lucide-react";

export interface ReadWidgetProps {
  /** 文件路径 */
  filePath: string;
  /** 工具结果 */
  result?: any;
}

/**
 * 文件读取 Widget
 *
 * 展示文件读取操作，支持加载状态和结果展示
 */
export const ReadWidget: React.FC<ReadWidgetProps> = ({ filePath, result }) => {
  // 如果有结果，直接渲染结果组件，不显示额外的标签
  if (result) {
    let resultContent = '';
    if (typeof result.content === 'string') {
      resultContent = result.content;
    } else if (result.content && typeof result.content === 'object') {
      if (result.content.text) {
        resultContent = result.content.text;
      } else if (Array.isArray(result.content)) {
        resultContent = result.content
          .map((c: any) => (typeof c === 'string' ? c : c.text || JSON.stringify(c)))
          .join('\n');
      } else {
        resultContent = JSON.stringify(result.content, null, 2);
      }
    }

    // 直接返回结果组件，外层没有任何额外的 div 或 span
    return resultContent ? <ReadResultWidget content={resultContent} filePath={filePath} /> : null;
  }

// 简化版 Loading 状态
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 border border-border/50">
      <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <FileText className="h-3 w-3 text-muted-foreground" />
        <span className="text-xs font-mono text-foreground/80 truncate" title={filePath}>
          {filePath.split(/[/\\]/).pop()}
        </span>
        <span className="text-[10px] text-muted-foreground truncate hidden sm:inline-block max-w-[200px] opacity-60">
          {filePath}
        </span>
      </div>
    </div>
  );
};
