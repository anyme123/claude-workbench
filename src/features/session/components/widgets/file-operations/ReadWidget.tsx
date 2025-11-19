/**
 * ✅ Read Widget - 文件读取展示
 *
 * 迁移自 ToolWidgets.tsx (原 422-469 行)
 * 用于展示文件读取操作和结果
 */

import React from "react";
import { FileText } from "lucide-react";
import { ReadResultWidget } from './ReadResultWidget';

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
  // 如果有结果，使用 ReadResultWidget 显示
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
          <FileText className="h-4 w-4 text-primary" />
          <span className="text-sm">文件内容：</span>
          <code className="text-sm font-mono bg-background px-2 py-0.5 rounded flex-1 truncate">
            {filePath}
          </code>
        </div>
        {resultContent && <ReadResultWidget content={resultContent} filePath={filePath} />}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
      <FileText className="h-4 w-4 text-primary" />
      <span className="text-sm">正在读取文件：</span>
      <code className="text-sm font-mono bg-background px-2 py-0.5 rounded flex-1 truncate">
        {filePath}
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
