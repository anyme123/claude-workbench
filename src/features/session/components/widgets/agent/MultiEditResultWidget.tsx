/**
 * ✅ MultiEdit Result Widget - 批量编辑结果展示
 *
 * 迁移自 ToolWidgets.tsx (原 2164-2236 行)
 * 用于展示批量编辑操作的 Diff 结果
 */

import React from "react";
import { GitBranch } from "lucide-react";

export interface MultiEditResultWidgetProps {
  /** 结果内容 */
  content: string;
  /** 编辑列表（可选，用于更好的展示） */
  edits?: Array<{ old_string: string; new_string: string }>;
}

/**
 * 批量编辑结果 Widget
 *
 * 展示多个编辑操作的结果，支持 Diff 视图
 */
export const MultiEditResultWidget: React.FC<MultiEditResultWidgetProps> = ({
  content,
  edits,
}) => {
  // 如果有 edits 数组，显示详细的 Diff 视图
  if (edits && edits.length > 0) {
    return (
      <div className="space-y-3">
        {/* 头部 */}
        <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 rounded-t-md border-b border-green-500/20">
          <GitBranch className="h-4 w-4 text-green-500" />
          <span className="text-sm font-medium text-green-600 dark:text-green-400">
            {edits.length} 个更改已应用
          </span>
        </div>

        {/* 编辑列表 */}
        <div className="space-y-4">
          {edits.map((edit, index) => {
            const oldLines = edit.old_string.split('\n');
            const newLines = edit.new_string.split('\n');

            return (
              <div key={index} className="border border-border/50 rounded-md overflow-hidden">
                <div className="px-3 py-1 bg-muted/50 border-b border-border/50">
                  <span className="text-xs font-medium text-muted-foreground">更改 {index + 1}</span>
                </div>

                <div className="font-mono text-xs">
                  {/* 显示删除的行 */}
                  {oldLines.map((line, lineIndex) => (
                    <div
                      key={`old-${lineIndex}`}
                      className="flex bg-red-500/10 border-l-4 border-red-500"
                    >
                      <span className="w-12 px-2 py-1 text-red-600 dark:text-red-400 select-none text-right bg-red-500/10">
                        -{lineIndex + 1}
                      </span>
                      <pre className="flex-1 px-3 py-1 text-red-700 dark:text-red-300 overflow-x-auto">
                        <code>{line || ' '}</code>
                      </pre>
                    </div>
                  ))}

                  {/* 显示添加的行 */}
                  {newLines.map((line, lineIndex) => (
                    <div
                      key={`new-${lineIndex}`}
                      className="flex bg-green-500/10 border-l-4 border-green-500"
                    >
                      <span className="w-12 px-2 py-1 text-green-600 dark:text-green-400 select-none text-right bg-green-500/10">
                        +{lineIndex + 1}
                      </span>
                      <pre className="flex-1 px-3 py-1 text-green-700 dark:text-green-300 overflow-x-auto">
                        <code>{line || ' '}</code>
                      </pre>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // 降级显示：简单的内容展示
  return (
    <div className="p-3 bg-muted/50 rounded-md border">
      <pre className="text-xs font-mono whitespace-pre-wrap">{content}</pre>
    </div>
  );
};
