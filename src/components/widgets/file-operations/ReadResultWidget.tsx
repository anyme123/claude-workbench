/**
 * ✅ Read Result Widget - 文件内容结果展示
 *
 * 迁移自 ToolWidgets.tsx (原 474-635 行)
 * 用于展示文件读取的结果内容，支持语法高亮和行号显示
 */

import React, { useState } from "react";
import { FileText, ChevronUp, ChevronDown } from "lucide-react";
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

  // 预先计算行数，决定默认展开状态
  const lineCount = content.split('\n').filter(line => line.trim()).length;
  const isLargeFile = lineCount > 20;
  // 小文件默认展开，大文件默认折叠
  const [isExpanded, setIsExpanded] = useState(!isLargeFile);

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

  return (
    <div className="w-full">
      {/* 头部 - Detached Header Style */}
      <div
        className={cn(
          "flex items-center justify-between bg-muted/30 p-2.5 rounded-md border border-border/50 mb-2 group/header select-none transition-colors",
          "cursor-pointer hover:bg-muted/50"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 text-blue-500 flex-shrink-0" />
            <span className="text-sm font-medium text-muted-foreground">Read</span>
            <span className="text-muted-foreground/30">|</span>
            <span className="text-sm font-mono text-foreground/90 font-medium truncate" title={filePath}>
              {filePath ? filePath.split(/[/\\]/).pop() : "File content"}
            </span>
            {filePath && (
              <span className="text-xs text-muted-foreground truncate hidden sm:inline-block max-w-[200px] opacity-70">
                {filePath}
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground ml-1 flex-shrink-0 font-mono">
            ({lineCount} lines)
          </span>
        </div>

        {/* 折叠按钮 */}
        <div className="h-6 px-2 ml-2 text-muted-foreground group-hover/header:text-foreground flex items-center gap-1 transition-colors">
          {isExpanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </div>
      </div>

      {/* 代码内容 - Separated Box */}
      {isExpanded && (
        <div className="rounded-lg border overflow-hidden bg-muted border-border/50">
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
                  fontSize: '0.8rem'
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
        </div>
      )}
    </div>
  );
};
