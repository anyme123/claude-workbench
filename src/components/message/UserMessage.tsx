import React, { useState, useEffect } from "react";
import { RotateCcw, AlertTriangle } from "lucide-react";
import { MessageBubble } from "./MessageBubble";
import { MessageHeader } from "./MessageHeader";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import type { ClaudeStreamMessage } from '@/types/claude';
import type { RewindCapabilities, RewindMode } from '@/lib/api';
import { api } from '@/lib/api';

interface UserMessageProps {
  /** 消息数据 */
  message: ClaudeStreamMessage;
  /** 自定义类名 */
  className?: string;
  /** 提示词索引（只计算用户提示词） */
  promptIndex?: number;
  /** Session ID */
  sessionId?: string;
  /** Project ID */
  projectId?: string;
  /** 撤回回调 */
  onRevert?: (promptIndex: number, mode: RewindMode) => void;
}

/**
 * 检查是否是 Skills 消息
 */
const isSkillsMessage = (text: string): boolean => {
  return text.includes('<command-name>') 
    || text.includes('Launching skill:')
    || text.includes('skill is running');
};

/**
 * 格式化 Skills 消息显示
 */
const formatSkillsMessage = (text: string): React.ReactNode => {
  // 提取 command-name 和 command-message
  const commandNameMatch = text.match(/<command-name>(.+?)<\/command-name>/);
  const commandMessageMatch = text.match(/<command-message>(.+?)<\/command-message>/);
  
  if (commandNameMatch || commandMessageMatch) {
    return (
      <div className="space-y-2">
        {commandMessageMatch && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-green-600">✓</span>
            <span>{commandMessageMatch[1]}</span>
          </div>
        )}
        {commandNameMatch && (
          <div className="text-xs text-muted-foreground font-mono">
            Skill: {commandNameMatch[1]}
          </div>
        )}
      </div>
    );
  }
  
  // 处理 "Launching skill:" 格式
  if (text.includes('Launching skill:')) {
    const skillNameMatch = text.match(/Launching skill: (.+)/);
    if (skillNameMatch) {
      return (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-green-600">✓</span>
            <span>Skill</span>
          </div>
          <div className="text-xs text-muted-foreground">
            Launching skill: <span className="font-mono">{skillNameMatch[1]}</span>
          </div>
        </div>
      );
    }
  }
  
  return text;
};

/**
 * 提取用户消息的纯文本内容
 */
const extractUserText = (message: ClaudeStreamMessage): string => {
  if (!message.message?.content) return '';
  
  const content = message.message.content;
  
  let text = '';
  
  // 如果是字符串，直接使用
  if (typeof content === 'string') {
    text = content;
  } 
  // 如果是数组，提取所有text类型的内容
  else if (Array.isArray(content)) {
    text = content
      .filter((item: any) => item.type === 'text')
      .map((item: any) => item.text || '')
      .join('\n');
  }
  
  // ⚡ 关键修复：JSONL 保存为 \\n（双反斜杠），需要替换为真正的换行
  // 正则 /\\\\n/ 匹配两个反斜杠+n
  if (text.includes('\\')) {
    text = text
      .replace(/\\\\n/g, '\n')      // \\n（双反斜杠+n）→ 换行符
      .replace(/\\\\r/g, '\r')      // \\r → 回车
      .replace(/\\\\t/g, '\t')      // \\t → 制表符
      .replace(/\\\\"/g, '"')       // \\" → 双引号
      .replace(/\\\\'/g, "'")       // \\' → 单引号
      .replace(/\\\\\\\\/g, '\\');  // \\\\ → 单个反斜杠（最后处理）
  }
  
  return text;
};

/**
 * 用户消息组件
 * 右对齐气泡样式，简洁展示
 */
export const UserMessage: React.FC<UserMessageProps> = ({
  message,
  className,
  promptIndex,
  sessionId,
  projectId,
  onRevert
}) => {
  const text = extractUserText(message);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [capabilities, setCapabilities] = useState<RewindCapabilities | null>(null);
  const [isLoadingCapabilities, setIsLoadingCapabilities] = useState(false);

  // 如果没有文本内容，不渲染
  if (!text) return null;

  // ⚡ 检查是否是 Skills 消息
  const isSkills = isSkillsMessage(text);
  const displayContent = isSkills ? formatSkillsMessage(text) : text;

  // 检测撤回能力
  useEffect(() => {
    const loadCapabilities = async () => {
      if (promptIndex === undefined || !sessionId || !projectId) return;

      setIsLoadingCapabilities(true);
      try {
        const caps = await api.checkRewindCapabilities(sessionId, projectId, promptIndex);
        setCapabilities(caps);
      } catch (error) {
        console.error('Failed to check rewind capabilities:', error);
      } finally {
        setIsLoadingCapabilities(false);
      }
    };

    if (showConfirmDialog) {
      loadCapabilities();
    }
  }, [showConfirmDialog, promptIndex, sessionId, projectId]);

  const handleRevertClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (promptIndex === undefined || !onRevert) return;
    setShowConfirmDialog(true);
  };

  const handleConfirmRevert = (mode: RewindMode) => {
    if (promptIndex !== undefined && onRevert) {
      setShowConfirmDialog(false);
      onRevert(promptIndex, mode);
    }
  };

  const showRevertButton = promptIndex !== undefined && promptIndex >= 0 && onRevert;
  const hasWarning = capabilities && !capabilities.code;

  return (
    <>
    <div
      id={promptIndex !== undefined ? `prompt-${promptIndex}` : undefined}
      className={cn("group relative", className)}
    >
      <MessageBubble variant="user" className="bg-gradient-to-br from-blue-50/80 to-indigo-50/80 dark:from-blue-900/50 dark:to-indigo-900/50 border border-blue-100/50 dark:border-blue-700/50 shadow-sm">
          <div className="relative">
        {/* 消息头部 */}
        <MessageHeader
          variant="user"
          timestamp={(message as any).sentAt || (message as any).timestamp}
          showAvatar={false}
        />

        {/* 消息内容和撤回按钮 - 同一行显示 */}
        <div className="flex items-start gap-2">
        {/* 消息内容 */}
          <div className={cn(
            "text-sm leading-relaxed flex-1",
            isSkills ? "" : "whitespace-pre-wrap"
          )}>
            {displayContent}
            </div>

          {/* 撤回按钮和警告图标 - Skills 消息不显示撤回按钮 */}
            {showRevertButton && !isSkills && (
            <div className="flex-shrink-0 flex items-center gap-1">
              {/* CLI 提示词警告图标 */}
              {hasWarning && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center justify-center h-7 w-7">
                        <AlertTriangle className="h-4 w-4 text-orange-500" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <p className="text-sm">
                        {capabilities?.warning || "此提示词无法回滚代码"}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              {/* 撤回按钮 */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                      variant="outline"
                        size="sm"
                      className="h-7 w-7 p-0 rounded-full border-primary-foreground/20 text-primary-foreground/60 hover:text-primary-foreground hover:bg-primary-foreground/10 hover:border-primary-foreground/40 transition-all"
                        onClick={handleRevertClick}
                      >
                      <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                  <TooltipContent side="top">
                    撤回到此消息
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            )}
        </div>
        </div>
      </MessageBubble>
    </div>

      {/* 撤回确认对话框 - 三模式选择 */}
      {showConfirmDialog && (
        <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
                选择撤回模式
              </DialogTitle>
              <DialogDescription>
                将撤回到提示词 #{(promptIndex ?? 0) + 1}，请选择撤回方式
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* CLI 提示词警告 */}
              {capabilities?.warning && (
                <Alert className="border-orange-500/50 bg-orange-50 dark:bg-orange-950/20">
                  <AlertTriangle className="h-4 w-4 text-orange-600" />
                  <AlertDescription className="text-orange-800 dark:text-orange-200">
                    {capabilities.warning}
                  </AlertDescription>
                </Alert>
              )}

              {/* 加载中状态 */}
              {isLoadingCapabilities && (
                <div className="flex items-center justify-center py-4">
                  <div className="text-sm text-muted-foreground">检测撤回能力中...</div>
                </div>
              )}

              {/* 三种模式选择 */}
              {!isLoadingCapabilities && capabilities && (
                <div className="space-y-3">
                  <div className="text-sm font-medium">选择撤回内容：</div>

                  {/* 模式1: 仅对话 */}
                  <div className={cn(
                    "p-4 rounded-lg border-2 cursor-pointer transition-all duration-200",
                    "hover:border-primary hover:bg-accent/50 hover:shadow-md hover:scale-[1.02]",
                    "active:scale-[0.98]"
                  )}
                    onClick={() => handleConfirmRevert("conversation_only")}
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="font-medium">仅删除对话</div>
                        <div className="text-sm text-muted-foreground">
                          删除此消息及之后的所有对话，代码保持不变
                        </div>
                      </div>
                      <div className="text-xs text-green-600 font-medium bg-green-50 dark:bg-green-950 px-2 py-1 rounded">
                        总是可用
                      </div>
                    </div>
                  </div>

                  {/* 模式2: 仅代码 */}
                  <div className={cn(
                    "p-4 rounded-lg border-2 transition-all duration-200",
                    capabilities.code
                      ? "cursor-pointer hover:border-primary hover:bg-accent/50 hover:shadow-md hover:scale-[1.02] active:scale-[0.98]"
                      : "opacity-50 cursor-not-allowed bg-muted"
                  )}
                    onClick={() => capabilities.code && handleConfirmRevert("code_only")}
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="font-medium">仅回滚代码</div>
                        <div className="text-sm text-muted-foreground">
                          代码回滚到此消息前的状态，保留对话记录
                        </div>
                      </div>
                      <div className={cn(
                        "text-xs font-medium px-2 py-1 rounded",
                        capabilities.code
                          ? "text-green-600 bg-green-50 dark:bg-green-950"
                          : "text-muted-foreground bg-muted"
                      )}>
                        {capabilities.code ? "可用" : "不可用"}
                      </div>
                    </div>
                  </div>

                  {/* 模式3: 两者都撤回 */}
                  <div className={cn(
                    "p-4 rounded-lg border-2 transition-all duration-200",
                    capabilities.both
                      ? "cursor-pointer hover:border-primary hover:bg-accent/50 hover:shadow-md hover:scale-[1.02] active:scale-[0.98]"
                      : "opacity-50 cursor-not-allowed bg-muted"
                  )}
                    onClick={() => capabilities.both && handleConfirmRevert("both")}
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="font-medium">完整撤回</div>
                        <div className="text-sm text-muted-foreground">
                          删除对话并回滚代码，恢复到此消息前的完整状态
                        </div>
                      </div>
                      <div className={cn(
                        "text-xs font-medium px-2 py-1 rounded",
                        capabilities.both
                          ? "text-green-600 bg-green-50 dark:bg-green-950"
                          : "text-muted-foreground bg-muted"
                      )}>
                        {capabilities.both ? "可用" : "不可用"}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>警告：</strong>此操作不可撤销，删除的对话无法恢复。
                </AlertDescription>
              </Alert>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowConfirmDialog(false)}
              >
                取消
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};
