/**
 * ✅ MultiEdit Widget - 批量编辑展示（Diff 视图）
 *
 * 迁移自 ToolWidgets.tsx (原 2059-2159 行)
 * 用于展示批量文件编辑操作的 Diff 对比
 */

import React, { useState } from "react";
import { FileEdit, FileText, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import * as Diff from 'diff';
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { getClaudeSyntaxTheme } from "@/lib/claudeSyntaxTheme";
import { useTheme } from "@/contexts/ThemeContext";
import { getLanguage } from "../common/languageDetector";

export interface MultiEditWidgetProps {
  /** 文件路径 */
  file_path: string;
  /** 编辑列表 */
  edits: Array<{ old_string: string; new_string: string }>;
  /** 工具结果 */
  result?: any;
}

/**
 * 批量编辑 Widget
 *
 * 展示多个编辑操作的 Diff 对比，支持语法高亮
 */
export const MultiEditWidget: React.FC<MultiEditWidgetProps> = ({
  file_path,
  edits,
  result: _result,
}) => {
  const { theme } = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);
  const language = getLanguage(file_path);

  return (
    <div className="space-y-2">
      {/* 头部 */}
      <div className="flex items-center gap-2 mb-2">
        <FileEdit className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">使用工具： MultiEdit</span>
      </div>

      <div className="ml-6 space-y-2">
        {/* 文件路径 */}
        <div className="flex items-center gap-2">
          <FileText className="h-3 w-3 text-blue-500" />
          <code className="text-xs font-mono text-blue-500">{file_path}</code>
        </div>

        {/* 编辑列表 */}
        <div className="space-y-1">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-90")} />
            {edits.length} 个编辑{edits.length !== 1 ? '项' : ''}
          </button>

          {/* 展开后显示所有编辑的 Diff */}
          {isExpanded && (
            <div className="space-y-3 mt-3">
              {edits.map((edit, index) => {
                const diffResult = Diff.diffLines(edit.old_string || '', edit.new_string || '', {
                  newlineIsToken: true,
                  ignoreWhitespace: false
                });

                return (
                  <div key={index} className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">编辑 {index + 1}</div>
                    <div className="rounded-lg border bg-zinc-950 overflow-hidden text-xs font-mono">
                      <div className="max-h-[300px] overflow-y-auto overflow-x-auto">
                        {diffResult.map((part, partIndex) => {
                          const partClass = part.added
                            ? 'bg-green-950/20'
                            : part.removed
                            ? 'bg-red-950/20'
                            : '';

                          // 折叠大量未更改的行
                          if (!part.added && !part.removed && part.count && part.count > 8) {
                            return (
                              <div key={partIndex} className="px-4 py-1 bg-zinc-900 border-y border-zinc-800 text-center text-zinc-500 text-xs">
                                ... {part.count} 未更改的行 ...
                              </div>
                            );
                          }

                          const value = part.value.endsWith('\n') ? part.value.slice(0, -1) : part.value;

                          return (
                            <div key={partIndex} className={cn(partClass, "flex")}>
                              <div className="w-8 select-none text-center flex-shrink-0">
                                {part.added ? <span className="text-green-400">+</span> : part.removed ? <span className="text-red-400">-</span> : null}
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
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
