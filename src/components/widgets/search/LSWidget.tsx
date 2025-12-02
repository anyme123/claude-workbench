/**
 * ✅ LS Widget - 目录列表展示
 *
 * 迁移自 ToolWidgets.tsx (原 199-246 行)
 * 用于展示目录内容列表
 */

import React from "react";
import { FolderOpen, AlertCircle } from "lucide-react";
import { LSResultWidget } from './LSResultWidget';

export interface LSWidgetProps {
  /** 目录路径 */
  path: string;
  /** 工具结果 */
  result?: any;
}

/**
 * 从多种可能的结果格式中提取内容
 */
function extractResultContent(result: any): string {
  if (!result) return '';

  // 直接字符串内容
  if (typeof result.content === 'string') {
    return result.content;
  }

  // 嵌套的 text 字段
  if (result.content?.text) {
    return result.content.text;
  }

  // 数组格式
  if (Array.isArray(result.content)) {
    return result.content
      .map((c: any) => (typeof c === 'string' ? c : c.text || JSON.stringify(c)))
      .join('\n');
  }

  // 对象格式 - 尝试提取常见字段
  if (result.content && typeof result.content === 'object') {
    // Gemini 可能返回 { output: "..." } 格式
    if (result.content.output) {
      return result.content.output;
    }
    // 或者 { result: "..." }
    if (result.content.result) {
      return result.content.result;
    }
    return JSON.stringify(result.content, null, 2);
  }

  // 直接检查 result 本身
  if (typeof result === 'string') {
    return result;
  }

  // result.output (Gemini 格式)
  if (result.output) {
    return result.output;
  }

  return '';
}

/**
 * 目录列表 Widget
 *
 * 展示目录的文件列表，支持加载状态和结果展示
 */
export const LSWidget: React.FC<LSWidgetProps> = ({ path, result }) => {
  // 如果有结果，使用 LSResultWidget 显示
  if (result) {
    const resultContent = extractResultContent(result);

    // 调试日志
    if (process.env.NODE_ENV === 'development') {
      console.log('[LSWidget] result:', result);
      console.log('[LSWidget] extractedContent:', resultContent?.substring(0, 200));
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
        {resultContent ? (
          <LSResultWidget content={resultContent} />
        ) : (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            <span>目录内容为空或无法解析</span>
          </div>
        )}
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
