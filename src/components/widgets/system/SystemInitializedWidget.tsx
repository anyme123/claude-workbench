/**
 * ✅ System Initialized Widget - 系统初始化信息展示
 *
 * 迁移并拆分自 ToolWidgets.tsx (原 2266-2493 行)
 * 主组件 (~100行) + ToolsList 子组件 (~180行)
 */

import React, { useState } from "react";
import { Settings, Fingerprint, Cpu, FolderOpen } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ToolsList } from "./components/ToolsList";

export interface SystemInitializedWidgetProps {
  /** 会话 ID */
  sessionId?: string;
  /** 模型名称 */
  model?: string;
  /** 工作目录 */
  cwd?: string;
  /** 可用工具列表 */
  tools?: string[];
  /** 时间戳 */
  timestamp?: string;
}

/**
 * 系统初始化 Widget
 *
 * 展示会话初始化信息，包括会话 ID、模型、工作目录和可用工具
 */
export const SystemInitializedWidget: React.FC<SystemInitializedWidgetProps> = ({
  sessionId,
  model,
  cwd,
  tools = [],
  timestamp,
}) => {
  const [mcpExpanded, setMcpExpanded] = useState(false);

  /**
   * 格式化时间戳
   */
  const formatTimestamp = (timestamp: string | undefined): string => {
    if (!timestamp) return '';

    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return '';

      return date.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return '';
    }
  };

  return (
    <Card className="border-blue-500/20 bg-blue-500/5">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Settings className="h-5 w-5 text-blue-500 mt-0.5" />
          <div className="flex-1 space-y-4">
            {/* 头部 */}
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-sm">System Initialized</h4>
              {formatTimestamp(timestamp) && (
                <span className="text-xs text-muted-foreground font-mono">
                  {formatTimestamp(timestamp)}
                </span>
              )}
            </div>

            {/* 会话信息 */}
            <div className="space-y-2">
              {sessionId && (
                <div className="flex items-center gap-2 text-xs">
                  <Fingerprint className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Session ID:</span>
                  <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                    {sessionId}
                  </code>
                </div>
              )}

              {model && (
                <div className="flex items-center gap-2 text-xs">
                  <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Model:</span>
                  <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                    {model}
                  </code>
                </div>
              )}

              {cwd && (
                <div className="flex items-center gap-2 text-xs">
                  <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Working Directory:</span>
                  <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded break-all">
                    {cwd}
                  </code>
                </div>
              )}
            </div>

            {/* 工具列表 */}
            <ToolsList
              tools={tools}
              mcpExpanded={mcpExpanded}
              onMcpToggle={() => setMcpExpanded(!mcpExpanded)}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
