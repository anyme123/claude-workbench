/**
 * ✅ LS Widget - 目录列表展示
 *
 * 迁移自 ToolWidgets.tsx (原 199-246 行)
 * 用于展示目录内容列表
 */

import React, { useState } from "react";
import { FolderOpen, AlertCircle, ChevronRight, ChevronDown, CheckCircle } from "lucide-react";
import { LSResultWidget } from './LSResultWidget';
import { cn } from "@/lib/utils";

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

  // Gemini 原始数组格式: [{functionResponse: {response: {output: "..."}}}]
  if (Array.isArray(result)) {
    const firstItem = result[0];
    if (firstItem?.functionResponse?.response?.output) {
      return firstItem.functionResponse.response.output;
    }
  }

  // 直接字符串内容
  if (typeof result.content === 'string') {
    return result.content;
  }

  // 嵌套的 text 字段
  if (result.content?.text) {
    return result.content.text;
  }

  // 数组格式 content
  if (Array.isArray(result.content)) {
    // 检查是否是 Gemini functionResponse 数组格式
    const firstContent = result.content[0];
    if (firstContent?.functionResponse?.response?.output) {
      return firstContent.functionResponse.response.output;
    }
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
 * 统计目录内容中的文件/文件夹数量
 */
function countItems(content: string): { files: number; dirs: number } {
  const lines = content.split('\n').filter(line => line.trim());
  let files = 0;
  let dirs = 0;

  for (const line of lines) {
    // 跳过标题行
    if (line.includes('Directory listing') || line.startsWith('---')) continue;
    // 目录通常以 / 结尾或包含 [DIR] 标记
    if (line.endsWith('/') || line.includes('[DIR]') || line.includes('(dir)')) {
      dirs++;
    } else if (line.trim()) {
      files++;
    }
  }

  return { files, dirs };
}

/**
 * 目录列表 Widget
 *
 * 展示目录的文件列表，支持加载状态和结果展示
 * 默认折叠，点击可展开
 */
export const LSWidget: React.FC<LSWidgetProps> = ({ path, result }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // 如果有结果，使用 LSResultWidget 显示
  if (result) {
    const resultContent = extractResultContent(result);

    // 调试日志
    if (process.env.NODE_ENV === 'development') {
      console.log('[LSWidget] result:', result);
      console.log('[LSWidget] extractedContent:', resultContent?.substring(0, 200));
    }

    const { files, dirs } = countItems(resultContent || '');
    const totalItems = files + dirs;

    return (
      <div className="rounded-lg border border-border overflow-hidden">
        {/* 可点击的标题栏 */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={cn(
            "flex items-center gap-2 w-full p-3 text-left transition-colors",
            "hover:bg-muted/50",
            isExpanded ? "bg-muted/30 border-b border-border" : "bg-muted/20"
          )}
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <FolderOpen className="h-4 w-4 text-primary shrink-0" />
          <code className="text-sm font-mono truncate flex-1">
            {path}
          </code>
          <div className="flex items-center gap-2 ml-auto shrink-0">
            {resultContent ? (
              <>
                <span className="text-xs text-muted-foreground">
                  {totalItems > 0 ? `${totalItems} 项` : '空目录'}
                  {dirs > 0 && files > 0 && ` (${dirs} 目录, ${files} 文件)`}
                </span>
                <CheckCircle className="h-3.5 w-3.5 text-green-500" />
              </>
            ) : (
              <AlertCircle className="h-3.5 w-3.5 text-yellow-500" />
            )}
          </div>
        </button>

        {/* 展开的内容 */}
        {isExpanded && (
          <div className="p-3 bg-background">
            {resultContent ? (
              <LSResultWidget content={resultContent} />
            ) : (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 text-sm text-muted-foreground">
                <AlertCircle className="h-4 w-4" />
                <span>目录内容为空或无法解析</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // 加载中状态
  return (
    <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-muted/20">
      <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
      <FolderOpen className="h-4 w-4 text-primary shrink-0" />
      <span className="text-sm">正在列示目录：</span>
      <code className="text-sm font-mono truncate">
        {path}
      </code>
    </div>
  );
};
