import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronUp, ChevronDown, X, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { FloatingPromptInput, type FloatingPromptInputRef, type ModelType } from "@/components/FloatingPromptInput";
import { type Session } from "@/lib/api";
import { type ClaudeStreamMessage } from "@/types/claude";
import { cn } from "@/lib/utils";
import { type SessionCostStats } from "@/hooks/useSessionCostCalculation";

interface QueuedPrompt {
    id: string;
    prompt: string;
    model: ModelType;
}

interface InputAreaProps {
    floatingPromptRef: React.RefObject<FloatingPromptInputRef>;
    onSend: (prompt: string, model: ModelType, maxThinkingTokens?: number) => Promise<void>;
    onCancel: () => void;
    isLoading: boolean;
    projectPath: string;
    session: Session | null;
    messages: ClaudeStreamMessage[];
    isPlanMode: boolean;
    onTogglePlanMode: () => void;
    costStats: SessionCostStats;
    formatCost: (cost: number) => string;

    queuedPrompts: QueuedPrompt[];
    setQueuedPrompts: React.Dispatch<React.SetStateAction<QueuedPrompt[]>>;
    queuedPromptsCollapsed: boolean;
    setQueuedPromptsCollapsed: React.Dispatch<React.SetStateAction<boolean>>;

    showPromptNavigator: boolean;
    setShowPromptNavigator: (show: boolean) => void;

    userScrolled: boolean;
    setUserScrolled: (scrolled: boolean) => void;
    setShouldAutoScroll: (should: boolean) => void;
    parentRef: React.RefObject<HTMLDivElement>;
    displayableMessagesLength: number;

    getConversationContext: () => string[];
}

export const InputArea: React.FC<InputAreaProps> = ({
    floatingPromptRef,
    onSend,
    onCancel,
    isLoading,
    projectPath,
    session,
    messages,
    isPlanMode,
    onTogglePlanMode,
    costStats,
    formatCost,
    queuedPrompts,
    setQueuedPrompts,
    queuedPromptsCollapsed,
    setQueuedPromptsCollapsed,
    showPromptNavigator,
    setShowPromptNavigator,
    userScrolled,
    setUserScrolled,
    setShouldAutoScroll,
    parentRef,
    displayableMessagesLength,
    getConversationContext,
}) => {
    return (
        <ErrorBoundary>
            {/* Queued Prompts Display */}
            <AnimatePresence>
                {queuedPrompts.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="fixed left-1/2 -translate-x-1/2 z-30 w-full max-w-3xl px-4"
                        style={{
                            bottom: 'calc(140px + env(safe-area-inset-bottom))', // 在输入区域上方
                        }}
                    >
                        <div className="floating-element backdrop-enhanced rounded-lg p-3 space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="text-xs font-medium text-muted-foreground mb-1">
                                    Queued Prompts ({queuedPrompts.length})
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => setQueuedPromptsCollapsed(prev => !prev)}>
                                    {queuedPromptsCollapsed ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                </Button>
                            </div>
                            {!queuedPromptsCollapsed && queuedPrompts.map((queuedPrompt, index) => (
                                <motion.div
                                    key={queuedPrompt.id}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 20 }}
                                    transition={{ delay: index * 0.05 }}
                                    className="flex items-start gap-2 bg-muted/50 rounded-md p-2"
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-xs font-medium text-muted-foreground">#{index + 1}</span>
                                            <span className="text-xs px-1.5 py-0.5 bg-primary/10 text-primary rounded">
                                                {queuedPrompt.model === "opus" ? "Opus" : queuedPrompt.model === "sonnet1m" ? "Sonnet 1M" : "Sonnet"}
                                            </span>
                                        </div>
                                        <p className="text-sm line-clamp-2 break-words">{queuedPrompt.prompt}</p>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 flex-shrink-0"
                                        onClick={() => setQueuedPrompts(prev => prev.filter(p => p.id !== queuedPrompt.id))}
                                    >
                                        <X className="h-3 w-3" />
                                    </Button>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Enhanced scroll controls with smart indicators */}
            {displayableMessagesLength > 5 && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ delay: 0.5 }}
                    className="absolute right-6 z-40"
                    style={{
                        bottom: 'calc(145px + env(safe-area-inset-bottom))', // 确保在输入区域上方且有足够间距
                    }}
                >
                    <div className="flex flex-col gap-1.5">
                        {/* Prompt Navigator Button */}
                        {!showPromptNavigator && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="flex flex-col items-center gap-1 bg-background/60 backdrop-blur-md border border-border/50 rounded-xl px-1.5 py-2 cursor-pointer hover:bg-accent/80 shadow-sm"
                                onClick={() => setShowPromptNavigator(true)}
                                title="提示词导航 - 快速跳转到任意提示词"
                            >
                                <List className="h-4 w-4" />
                                <div className="flex flex-col items-center text-[10px] leading-tight tracking-wider">
                                    <span>提</span>
                                    <span>示</span>
                                    <span>词</span>
                                </div>
                            </motion.div>
                        )}

                        {/* New message indicator - only show when user scrolled away */}
                        <AnimatePresence>
                            {userScrolled && (
                                <motion.div
                                    initial={{ opacity: 0, y: 20, scale: 0.8 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 20, scale: 0.8 }}
                                    className="flex flex-col items-center gap-1 bg-background/60 backdrop-blur-md border border-border/50 rounded-xl px-1.5 py-2 cursor-pointer hover:bg-accent/80 shadow-sm"
                                    onClick={() => {
                                        setUserScrolled(false);
                                        setShouldAutoScroll(true);
                                        if (parentRef.current) {
                                            parentRef.current.scrollTo({
                                                top: parentRef.current.scrollHeight,
                                                behavior: 'smooth'
                                            });
                                        }
                                    }}
                                    title="新消息 - 点击滚动到底部"
                                >
                                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                                    <div className="flex flex-col items-center text-[10px] leading-tight tracking-wider">
                                        <span>新</span>
                                        <span>消</span>
                                        <span>息</span>
                                    </div>
                                    <ChevronDown className="h-3 w-3" />
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Traditional scroll controls */}
                        <div className="flex flex-col bg-background/60 backdrop-blur-md border border-border/50 rounded-xl overflow-hidden shadow-sm">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setUserScrolled(true);
                                    setShouldAutoScroll(false);
                                    if (parentRef.current) {
                                        parentRef.current.scrollTo({
                                            top: 0,
                                            behavior: 'smooth'
                                        });
                                    }
                                }}
                                className="px-1.5 py-1.5 hover:bg-accent/80 rounded-none h-auto min-h-0"
                                title="滚动到顶部"
                            >
                                <ChevronUp className="h-3.5 w-3.5" />
                            </Button>
                            <div className="h-px w-full bg-border/50" />
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setUserScrolled(false);
                                    setShouldAutoScroll(true);
                                    if (parentRef.current) {
                                        parentRef.current.scrollTo({
                                            top: parentRef.current.scrollHeight,
                                            behavior: 'smooth'
                                        });
                                    }
                                }}
                                className="px-1.5 py-1.5 hover:bg-accent/80 rounded-none h-auto min-h-0"
                                title="滚动到底部"
                            >
                                <ChevronDown className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    </div>
                </motion.div>
            )}

            <div className={cn(
                "fixed bottom-0 left-0 right-0 transition-all duration-300 z-50"
            )}>
                <FloatingPromptInput
                    ref={floatingPromptRef}
                    onSend={onSend}
                    onCancel={onCancel}
                    isLoading={isLoading}
                    disabled={!projectPath}
                    projectPath={projectPath}
                    sessionId={session?.id}
                    projectId={session?.project_id}
                    sessionModel={session?.model}
                    getConversationContext={getConversationContext}
                    messages={messages}
                    isPlanMode={isPlanMode}
                    onTogglePlanMode={onTogglePlanMode}
                    sessionCost={formatCost(costStats.totalCost)}
                    sessionStats={costStats}
                    hasMessages={messages.length > 0}
                    session={session || undefined}
                />
            </div>
        </ErrorBoundary>
    );
};
