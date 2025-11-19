/**
 * ✅ Write Widget - 文件写入展示
 *
 * 迁移并拆分自 ToolWidgets.tsx (原 788-1037 行)
 * 主组件 (~120行) + CodePreview (~90行) + FullScreenPreview (~140行)
 */

import React, { useState } from "react";
import { FileEdit, ExternalLink, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { getLanguage } from "../common/languageDetector";
import { CodePreview } from "./components/CodePreview";
import { FullScreenPreview } from "./components/FullScreenPreview";

export interface WriteWidgetProps {
  /** 文件路径 */
  filePath: string;
  /** 文件内容 */
  content: string;
  /** 工具结果 */
  result?: any;
}

/**
 * 文件写入 Widget
 *
 * Features:
 * - 代码预览（可折叠）
 * - 全屏查看模式
 * - 文件大小显示
 * - 系统打开文件
 * - Markdown 特殊渲染
 */
export const WriteWidget: React.FC<WriteWidgetProps> = ({
  filePath,
  content,
  result: _result,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);  // 默认收起

  const language = getLanguage(filePath);

  // Markdown 文件和小文件不截断，其他大文件截断到 5000 字符
  const isMarkdown = filePath.toLowerCase().endsWith('.md');
  const truncateLimit = isMarkdown ? 10000 : 5000;  // .md 文件限制更高
  const isLargeContent = content.length > truncateLimit;
  const displayContent = isLargeContent ? content.substring(0, truncateLimit) + "\n..." : content;

  /**
   * 在系统中打开文件
   */
  const handleOpenInSystem = async () => {
    try {
      await api.openFileWithDefaultApp(filePath);
    } catch (error) {
      console.error('Failed to open file in system:', error);
    }
  };

  return (
    <>
      <div className="space-y-2">
        {/* 头部 */}
        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
          {/* 展开/收起按钮 */}
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0"
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? "收起预览" : "展开预览"}
          >
            <ChevronRight className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
          </Button>

          <FileEdit className="h-4 w-4 text-primary" />
          <span className="text-sm">写入文件：</span>
          <code
            className="text-sm font-mono bg-background px-2 py-0.5 rounded flex-1 truncate cursor-pointer hover:bg-accent transition-colors"
            onClick={() => setIsMaximized(true)}
            title="点击查看完整内容"
          >
            {filePath}
          </code>

          {/* 文件大小 */}
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {(content.length / 1024).toFixed(1)} KB
          </span>

          {/* 系统打开按钮 */}
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={handleOpenInSystem}
            title="用系统默认应用打开"
          >
            <ExternalLink className="h-3 w-3 mr-1" />
            打开
          </Button>
        </div>

        {/* 代码预览（默认收起） */}
        {isExpanded && (
          <CodePreview
            codeContent={displayContent}
            language={language}
            truncated={isLargeContent}
            truncateLimit={truncateLimit}
            onMaximize={() => setIsMaximized(true)}
          />
        )}
      </div>

      {/* 全屏预览 */}
      <FullScreenPreview
        isOpen={isMaximized}
        onClose={() => setIsMaximized(false)}
        filePath={filePath}
        content={content}
        language={language}
        isMarkdown={isMarkdown}
        onOpenInSystem={handleOpenInSystem}
      />
    </>
  );
};
