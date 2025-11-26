/**
 * ✅ Read Result Widget - 文件内容结果展示
 *
 * 迁移自 ToolWidgets.tsx (原 474-635 行)
 * 用于展示文件读取的结果内容，支持语法高亮和行号显示
 */

import React, { useState } from "react";
import { FileText, ChevronRight } from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { getClaudeSyntaxTheme } from "@/lib/claudeSyntaxTheme";
import { useTheme } from "@/contexts/ThemeContext";
import { getLanguage } from "../common/languageDetector";
import { cn } from "@/lib/utils";

export interface ReadResultWidgetProps {
  /** 文件内容 */
  content: string;
  /** 文件路径（用于语法高亮） */
  filePath?: string;
}

/**
 * 文件内容结果 Widget
 *
 * Features:
 * - 自动语法高亮
 * - 行号显示
 * - 大文件折叠
 * - 解析 Read 工具的行号格式 (如 "123→code")
 */
export const ReadResultWidget: React.FC<ReadResultWidgetProps> = ({ content, filePath }) => {
  const { theme } = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);

  /**
   * 解析内容，分离行号和代码
   */
  const parseContent = (rawContent: string) => {
    const lines = rawContent.split('\n');
    const codeLines: string[] = [];
    let minLineNumber = Infinity;

    // 判断内容是否可能是带行号的格式
    // 如果超过 50% 的非空行匹配 "数字→" 格式，则认为是带行号的
    const nonEmptyLines = lines.filter(line => line.trim() !== '');
    if (nonEmptyLines.length === 0) {
      return { codeContent: rawContent, startLineNumber: 1 };
    }

    const parsableLines = nonEmptyLines.filter(line => /^\s*\d+→/.test(line)).length;
    const isLikelyNumbered = (parsableLines / nonEmptyLines.length) > 0.5;

    if (!isLikelyNumbered) {
      return { codeContent: rawContent, startLineNumber: 1 };
    }

    // 解析带行号的内容
    for (const line of lines) {
      const trimmedLine = line.trimStart();
      const match = trimmedLine.match(/^(\d+)→(.*)$/);

      if (match) {
        const lineNum = parseInt(match[1], 10);
        if (minLineNumber === Infinity) {
          minLineNumber = lineNum;
        }
        // 保留箭头后的代码内容
        codeLines.push(match[2]);
      } else if (line.trim() === '') {
        // 保留空行
        codeLines.push('');
      } else {
        // 格式异常的行渲染为空行
        codeLines.push('');
      }
    }

    // 移除末尾空行
    while (codeLines.length > 0 && codeLines[codeLines.length - 1] === '') {
      codeLines.pop();
    }

    return {
      codeContent: codeLines.join('\n'),
      startLineNumber: minLineNumber === Infinity ? 1 : minLineNumber
    };
  };

  const language = getLanguage(filePath || '');
  const { codeContent, startLineNumber } = parseContent(content);
  const lineCount = content.split('\n').filter(line => line.trim()).length;
  const isLargeFile = lineCount > 20;

  return (
    <div className="rounded-lg overflow-hidden border w-full bg-zinc-100 dark:bg-zinc-950 border-zinc-300 dark:border-zinc-800">
      {/* 头部 */}
      <div className="px-4 py-2 border-b flex items-center justify-between bg-zinc-200/50 dark:bg-zinc-700/30 border-zinc-300 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <FileText className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
          <span className="text-xs font-mono text-zinc-700 dark:text-zinc-200">
            {filePath || "File content"}
          </span>
          {isLargeFile && (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              ({lineCount} lines)
            </span>
          )}
        </div>

        {/* 大文件折叠按钮 */}
        {isLargeFile && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 text-xs transition-colors text-zinc-600 hover:text-zinc-800 dark:text-zinc-300 dark:hover:text-zinc-100"
          >
            <ChevronRight className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-90")} />
            {isExpanded ? "收起" : "展开"}
          </button>
        )}
      </div>

      {/* 代码内容 */}
      {(!isLargeFile || isExpanded) && (
        <div className="relative overflow-x-auto">
          <SyntaxHighlighter
            language={language}
            style={getClaudeSyntaxTheme(theme === 'dark')}
            showLineNumbers
            startingLineNumber={startLineNumber}
            wrapLongLines={false}
            customStyle={{
              margin: 0,
              background: 'transparent',
              lineHeight: '1.6'
            }}
            codeTagProps={{
              style: {
                fontSize: '0.75rem'
              }
            }}
            lineNumberStyle={{
              minWidth: "3.5rem",
              paddingRight: "1rem",
              textAlign: "right",
              opacity: 0.5,
            }}
          >
            {codeContent}
          </SyntaxHighlighter>
        </div>
      )}
    </div>
  );
};
