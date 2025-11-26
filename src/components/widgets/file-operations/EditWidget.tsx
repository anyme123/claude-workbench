/**
 * ✅ Edit Widget - 文件编辑展示（Diff 视图）
 *
 * 迁移自 ToolWidgets.tsx (原 1466-1568 行)
 * 用于展示文件编辑操作的 Diff 对比
 */

import React, { useState } from "react";
import { FileEdit, FileText, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import * as Diff from 'diff';
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { getClaudeSyntaxTheme } from "@/lib/claudeSyntaxTheme";
import { useTheme } from "@/contexts/ThemeContext";
import { getLanguage } from "../common/languageDetector";

export interface EditWidgetProps {
  /** 文件路径 */
  file_path: string;
  /** 旧字符串 */
  old_string: string;
  /** 新字符串 */
  new_string: string;
  /** 工具结果 */
  result?: any;
}

/**
 * 文件编辑 Widget
 *
 * 展示文件编辑的 Diff 对比，支持语法高亮
 */
export const EditWidget: React.FC<EditWidgetProps> = ({
  file_path,
  old_string,
  new_string,
  result: _result,
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [isExpanded, setIsExpanded] = useState(false);

  const diffResult = Diff.diffLines(old_string || '', new_string || '', {
    newlineIsToken: true,
    ignoreWhitespace: false
  });
  const language = getLanguage(file_path);

  return (
    <div className="space-y-2">
      {/* 头部 */}
      <div className="flex items-center gap-2 mb-2">
        <FileEdit className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">使用工具： Edit</span>
      </div>

      <div className="ml-6 space-y-2">
        {/* 文件路径和展开按钮 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1">
            <FileText className="h-3 w-3 text-blue-500" />
            <code className="text-xs font-mono text-blue-500 truncate">{file_path}</code>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-6 px-2"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-3 w-3 mr-1" />
                <span className="text-xs">收起</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3 mr-1" />
                <span className="text-xs">展开</span>
              </>
            )}
          </Button>
        </div>

        {/* Diff 视图 */}
        {isExpanded && (
          <div className={cn(
            "rounded-lg border overflow-hidden text-xs font-mono mt-2",
            isDark ? "bg-zinc-950 border-zinc-800" : "bg-zinc-100 border-zinc-300"
          )}>
            <div className="max-h-[440px] overflow-y-auto overflow-x-auto">
              {diffResult.map((part, index) => {
                const partClass = part.added
                  ? isDark ? 'bg-green-950/20' : 'bg-green-100'
                  : part.removed
                  ? isDark ? 'bg-red-950/20' : 'bg-red-100'
                  : '';

                // 折叠大量未更改的行
                if (!part.added && !part.removed && part.count && part.count > 8) {
                  return (
                    <div key={index} className={cn(
                      "px-4 py-1 border-y text-center text-xs",
                      isDark ? "bg-zinc-900 border-zinc-800 text-zinc-500" : "bg-zinc-200 border-zinc-300 text-zinc-500"
                    )}>
                      ... {part.count} 未更改的行 ...
                    </div>
                  );
                }

                const value = part.value.endsWith('\n') ? part.value.slice(0, -1) : part.value;

                return (
                  <div key={index} className={cn(partClass, "flex")}>
                    <div className="w-8 select-none text-center flex-shrink-0">
                      {part.added ? <span className={isDark ? "text-green-400" : "text-green-600"}>+</span> : part.removed ? <span className={isDark ? "text-red-400" : "text-red-600"}>-</span> : null}
                    </div>
                    <div className="flex-1">
                      <SyntaxHighlighter
                        language={language}
                        style={getClaudeSyntaxTheme(theme === 'dark')}
                        PreTag="div"
                        wrapLongLines={false}
                        customStyle={{
                          margin: 0,
                          padding: 0,
                          background: 'transparent',
                        }}
                        codeTagProps={{
                          style: {
                            fontSize: '0.75rem',
                            lineHeight: '1.6',
                          }
                        }}
                      >
                        {value}
                      </SyntaxHighlighter>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
