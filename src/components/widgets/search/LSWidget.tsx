/**
 * ✅ LS Widget - 目录列表展示
 *
 * 迁移自 ToolWidgets.tsx (原 199-246 行)
 * 用于展示目录内容列表
 */

import React from "react";
import { FolderOpen } from "lucide-react";
import { LSResultWidget } from './LSResultWidget';

export interface LSWidgetProps {
  /** 目录路径 */
  path: string;
  /** 工具结果 */
  result?: any;
}

/**
 * 目录列表 Widget
 *
 * 展示目录的文件列表，支持加载状态和结果展示
 */
export const LSWidget: React.FC<LSWidgetProps> = ({ path, result }) => {
  // 如果有结果，使用 LSResultWidget 显示
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

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
          <FolderOpen className="h-4 w-4 text-primary" />
          <span className="text-sm">目录内容：</span>
          <code className="text-sm font-mono bg-background px-2 py-0.5 rounded">
            {path}
          </code>
        </div>
        {resultContent && <LSResultWidget content={resultContent} />}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
      <FolderOpen className="h-4 w-4 text-primary" />
      <span className="text-sm">正在列示目录：</span>
      <code className="text-sm font-mono bg-background px-2 py-0.5 rounded">
        {path}
      </code>
      {!result && (
        <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <div className="h-2 w-2 bg-blue-500 rounded-full animate-pulse" />
          <span>加载中...</span>
        </div>
      )}
    </div>
  );
};
