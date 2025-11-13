/**
 * ✅ Edit Result Widget - 文件编辑结果展示
 *
 * 迁移自 ToolWidgets.tsx (原 1573-1650 行)
 * 用于展示文件编辑后的代码片段，带语法高亮和行号
 */

import React from "react";
import { GitBranch, ChevronRight } from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { getClaudeSyntaxTheme } from "@/lib/claudeSyntaxTheme";
import { useTheme } from "@/contexts/ThemeContext";
import { getLanguage } from "../common/languageDetector";

export interface EditResultWidgetProps {
  /** 编辑结果内容 */
  content: string;
}

/**
 * 编辑结果 Widget
 *
 * 解析编辑结果内容，提取文件路径和修改后的代码
 */
export const EditResultWidget: React.FC<EditResultWidgetProps> = ({ content }) => {
  const { theme } = useTheme();

  // 解析内容，提取文件路径和代码片段
  const lines = content.split('\n');
  let filePath = '';
  const codeLines: { lineNumber: string; code: string }[] = [];
  let inCodeBlock = false;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '');

    // 提取文件路径
    if (line.includes('The file') && line.includes('has been updated')) {
      const match = line.match(/The file (.+) has been updated/);
      if (match) {
        filePath = match[1];
      }
    }
    // 解析带行号的代码行
    else if (/^\s*\d+/.test(line)) {
      inCodeBlock = true;
      const lineMatch = line.match(/^\s*(\d+)\t?(.*)$/);
      if (lineMatch) {
        const [, lineNum, codePart] = lineMatch;
        codeLines.push({
          lineNumber: lineNum,
          code: codePart,
        });
      }
    }
    // 代码块内的非编号行（空行）
    else if (inCodeBlock) {
      codeLines.push({ lineNumber: '', code: line });
    }
  }

  const codeContent = codeLines.map(l => l.code).join('\n');
  const firstNumberedLine = codeLines.find(l => l.lineNumber !== '');
  const startLineNumber = firstNumberedLine ? parseInt(firstNumberedLine.lineNumber) : 1;
  const language = getLanguage(filePath);

  return (
    <div className="rounded-lg border bg-zinc-950 overflow-hidden">
      {/* 头部 */}
      <div className="px-4 py-2 border-b bg-emerald-950/30 flex items-center gap-2">
        <GitBranch className="h-3.5 w-3.5 text-emerald-500" />
        <span className="text-xs font-mono text-emerald-400">Edit Result</span>
        {filePath && (
          <>
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs font-mono text-muted-foreground">{filePath}</span>
          </>
        )}
      </div>

      {/* 代码内容 */}
      <div className="overflow-x-auto max-h-[440px]">
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
    </div>
  );
};
