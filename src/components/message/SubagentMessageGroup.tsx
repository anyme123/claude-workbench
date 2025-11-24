/**
 * 子代理消息组组件
 *
 * 将子代理的完整操作链路（从 Task 调用到执行完成）作为一个整体进行渲染
 * 提供视觉分隔和折叠/展开功能
 */

import React, { useState } from "react";
import { Bot, ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { AIMessage } from "./AIMessage";
import { UserMessage } from "./UserMessage";
import type { SubagentGroup } from "@/lib/subagentGrouping";
import { getSubagentMessageRole } from "@/lib/subagentGrouping";

interface SubagentMessageGroupProps {
  /** 子代理消息组 */
  group: SubagentGroup;
  /** 自定义类名 */
  className?: string;
  /** 链接检测回调 */
  onLinkDetected?: (url: string) => void;
}

/**
 * 子代理消息组
 *
 * 将 Task 工具调用和相关的子代理消息打包展示
 * 使用独立的视觉样式（边框、背景色、缩进）进行区分
 */
export const SubagentMessageGroup: React.FC<SubagentMessageGroupProps> = ({
  group,
  className,
  onLinkDetected,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  // 🛡️ 防御性编程：验证 subagentMessages 数组
  const subagentMessages = Array.isArray(group.subagentMessages) ? group.subagentMessages : [];

  // 统计子代理消息数量
  const messageCount = subagentMessages.length;
  const userMessages = subagentMessages.filter(m => m?.type === 'user').length;
  const assistantMessages = subagentMessages.filter(m => m?.type === 'assistant').length;

  // 🛡️ 如果没有 taskMessage，返回 null 防止崩溃
  if (!group.taskMessage) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[SubagentMessageGroup] Missing taskMessage in group:', group);
    }
    return null;
  }

  return (
    <div className={cn("relative my-4", className)}>
      {/* 子代理组容器 */}
      <div className="rounded-lg border-2 border-purple-500/30 bg-purple-500/5 overflow-hidden">

        {/* Task 工具调用（固定显示） */}
        <div className="border-b border-purple-500/20">
          <AIMessage
            message={group.taskMessage}
            isStreaming={false}
            onLinkDetected={onLinkDetected}
            className="m-0"
          />
        </div>

        {/* 折叠控制按钮 */}
        <div className="px-4 py-2 bg-purple-500/10 border-b border-purple-500/20">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 text-sm font-medium text-purple-700 dark:text-purple-300 hover:text-purple-900 dark:hover:text-purple-100 transition-colors w-full"
          >
            <div className="flex items-center gap-1.5">
              <Bot className="h-4 w-4" />
              <Sparkles className="h-3 w-3" />
            </div>
            <span>子代理执行过程</span>
            <span className="text-xs text-purple-600/70 dark:text-purple-400/70">
              ({messageCount} 条消息)
            </span>
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 ml-auto" />
            ) : (
              <ChevronRight className="h-4 w-4 ml-auto" />
            )}
          </button>
        </div>

        {/* 子代理消息列表（可折叠） */}
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="pl-4 pr-2 py-3 space-y-2 bg-purple-500/5">
                {/* 子代理消息说明 */}
                <div className="text-xs text-muted-foreground mb-2 px-2">
                  <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400">
                    <div className="h-px flex-1 bg-purple-500/20" />
                    <span>子代理内部对话</span>
                    <div className="h-px flex-1 bg-purple-500/20" />
                  </div>
                </div>

                {/* 渲染子代理消息 */}
                {subagentMessages.length > 0 ? (
                  subagentMessages.map((message, index) => {
                    // 🛡️ 跳过 null/undefined 消息
                    if (!message) {
                      if (process.env.NODE_ENV !== 'production') {
                        console.warn('[SubagentMessageGroup] Skipping null/undefined message at index:', index);
                      }
                      return null;
                    }

                    const role = getSubagentMessageRole(message);

                    // 根据修正后的角色渲染消息
                    if (role === 'assistant' || message.type === 'assistant') {
                      return (
                        <div key={`msg-${index}-${message.timestamp || index}`} className="pl-2">
                          <AIMessage
                            message={message}
                            isStreaming={false}
                            onLinkDetected={onLinkDetected}
                            className="shadow-sm"
                          />
                        </div>
                      );
                    } else if (role === 'user' || message.type === 'user') {
                      // 如果是主代理发给子代理的提示词，添加特殊标识
                      const isPromptToSubagent = message.type === 'user' &&
                        Array.isArray(message.message?.content) &&
                        message.message.content.some((item: any) => item?.type === 'text');

                      return (
                        <div key={`msg-${index}-${message.timestamp || index}`} className="pl-2">
                          {isPromptToSubagent && (
                            <div className="text-xs text-purple-600 dark:text-purple-400 mb-1 px-2 flex items-center gap-1">
                              <Bot className="h-3 w-3" />
                              <span>主代理 → 子代理任务</span>
                            </div>
                          )}
                          <UserMessage
                            message={message}
                            className="shadow-sm"
                          />
                        </div>
                      );
                    }

                    return null;
                  })
                ) : (
                  <div className="text-xs text-muted-foreground px-2 py-4 text-center">
                    暂无子代理消息
                  </div>
                )}

                {/* 统计信息 */}
                {messageCount > 0 && (
                  <div className="text-xs text-muted-foreground mt-3 px-2 pt-2 border-t border-purple-500/20">
                    <div className="flex items-center gap-4">
                      <span>交互轮次: {Math.ceil(messageCount / 2)}</span>
                      <span>•</span>
                      <span>子代理回复: {assistantMessages}</span>
                      <span>•</span>
                      <span>任务消息: {userMessages}</span>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 左侧指示线 */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-purple-500/50 via-purple-500/30 to-purple-500/50 rounded-l-lg" />
    </div>
  );
};
