import React, { useState, useEffect, useRef, useMemo } from "react";
import { RotateCcw, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { MessageBubble } from "./MessageBubble";
import { MessageImagePreview, extractImagesFromContent, extractImagePathsFromText } from "./MessageImagePreview";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import type { ClaudeStreamMessage } from '@/types/claude';
import type { RewindCapabilities, RewindMode } from '@/lib/api';
import { formatTimestamp } from "@/lib/messageUtils";
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
 * 🆕 支持长文本自动折叠（超过 5 行时折叠）
 */
export const UserMessage: React.FC<UserMessageProps> = ({
  message,
  className,
  promptIndex,
  sessionId,
  projectId,
  onRevert
}) => {
  const engine = (message as any).engine || 'claude';
  const text = extractUserText(message);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [capabilities, setCapabilities] = useState<RewindCapabilities | null>(null);
  const [isLoadingCapabilities, setIsLoadingCapabilities] = useState(false);

  // 🆕 折叠功能相关状态
  const [isExpanded, setIsExpanded] = useState(false);
  const [shouldCollapse, setShouldCollapse] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // 🆕 从 content 数组提取图片（base64 格式）
  const contentImages = useMemo(() => {
    const content = message.message?.content;
    if (!content || !Array.isArray(content)) return [];
    return extractImagesFromContent(content);
  }, [message]);

  // 🆕 从文本中提取图片路径（@path 格式）
  const { images: textImages, cleanText } = useMemo(() => {
    return extractImagePathsFromText(text);
  }, [text]);

  // 合并所有图片
  const images = useMemo(() => {
    return [...contentImages, ...textImages];
  }, [contentImages, textImages]);

  // 如果没有文本内容且没有图片，不渲染
  if (!text && images.length === 0) return null;

  // ⚡ 检查是否是 Skills 消息
  const isSkills = isSkillsMessage(text);
  // 使用清理后的文本（移除图片路径），但 Skills 消息保持原样
  const displayContent = isSkills ? formatSkillsMessage(text) : (cleanText || text);

  // 🆕 计算是否需要折叠（超过 5 行）
  useEffect(() => {
    if (!contentRef.current || isSkills || !displayContent) {
      setShouldCollapse(false);
      return;
    }

    // 计算行数：使用清理后的文本
    const textToCheck = typeof displayContent === 'string' ? displayContent : text;
    const lines = textToCheck.split('\n').length;

    // 如果超过 5 行，需要折叠
    if (lines > 5) {
      setShouldCollapse(true);
    } else {
      setShouldCollapse(false);
    }
  }, [text, isSkills, displayContent]);

  // 检测撤回能力
  useEffect(() => {
    const loadCapabilities = async () => {
      if (promptIndex === undefined || !sessionId) return;
      if (engine !== 'codex' && !projectId) return;

      setIsLoadingCapabilities(true);
      try {
        const caps = engine === 'codex'
          ? await api.checkCodexRewindCapabilities(sessionId, promptIndex)
          : await api.checkRewindCapabilities(sessionId, projectId!, promptIndex);
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
  }, [showConfirmDialog, promptIndex, sessionId, projectId, engine]);

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
      <div className="flex justify-end">
        <div className="relative">
          <MessageBubble
            variant="user"
            sideContent={images.length > 0 && (
              <MessageImagePreview
                images={images}
                compact
              />
            )}
          >
            <div className="relative">
        {/* 消息头部 (Removed) */}
        {/* MessageHeader removed to save space */}

        {/* 消息内容和撤回按钮 - 同一行显示 */}
        <div className="flex items-start gap-2">
        {/* 消息内容 */}
          <div className="flex-1 space-y-1">
            {/* 文本内容（只在有文本时显示） */}
            {displayContent && (
              <>
                <div
                  ref={contentRef}
                  className={cn(
                    "text-sm leading-relaxed",
                    isSkills ? "" : "whitespace-pre-wrap",
                    // 折叠样式：未展开时限制为 5 行
                    shouldCollapse && !isExpanded && "line-clamp-5 overflow-hidden"
                  )}
                >
                  {displayContent}
                </div>

                {/* 展开/收起按钮 */}
                {shouldCollapse && (
                  <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex items-center gap-1 text-xs text-primary-foreground/70 hover:text-primary-foreground transition-colors mt-1"
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp className="h-3 w-3" />
                        <span>收起</span>
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3 w-3" />
                        <span>展开</span>
                      </>
                    )}
                  </button>
                )}
              </>
            )}
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
      
      {/* Footer: Timestamp (Hover Only) */}
      <div className="absolute -bottom-5 right-1 text-[10px] text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 select-none pointer-events-none">
        {(message as any).sentAt || (message as any).timestamp ? formatTimestamp((message as any).sentAt || (message as any).timestamp) : ""}
      </div>
        </div>
      </div>
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
