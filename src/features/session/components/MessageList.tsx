import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { type Virtualizer } from "@tanstack/react-virtual";
import { StreamMessageV2 } from "@/components/message";
import { type Session, type RewindMode, type ClaudeSettings } from "@/lib/api";
import { type MessageGroup } from "@/lib/subagentGrouping";

interface MessageListProps {
    parentRef: React.RefObject<HTMLDivElement>;
    rowVirtualizer: Virtualizer<HTMLDivElement, Element>;
    messageGroups: MessageGroup[];
    isLoading: boolean;
    onLinkDetected: (url: string) => void;
    claudeSettings: ClaudeSettings;
    session: Session | null;
    onRevert: (promptIndex: number, mode: RewindMode) => void;
    getPromptIndexForMessage: (index: number) => number | undefined;
}

export const MessageList: React.FC<MessageListProps> = ({
    parentRef,
    rowVirtualizer,
    messageGroups,
    isLoading,
    onLinkDetected,
    claudeSettings,
    session,
    onRevert,
    getPromptIndexForMessage,
}) => {
    return (
        <div
            ref={parentRef}
            className="flex-1 overflow-y-auto relative"
            style={{
                paddingBottom: 'calc(140px + env(safe-area-inset-bottom))', // 增加底部空间，避免与输入框重叠
                paddingTop: '20px',
            }}
        >
            <div
                className="relative w-full max-w-5xl lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[85%] mx-auto px-4 pt-8 pb-4"
                style={{
                    height: `${Math.max(rowVirtualizer.getTotalSize(), 100)}px`,
                    minHeight: '100px',
                }}
            >
                <AnimatePresence>
                    {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                        const messageGroup = messageGroups[virtualItem.index];
                        const message = messageGroup.type === 'normal' ? messageGroup.message : null;
                        const originalIndex = messageGroup.type === 'normal' ? messageGroup.index : undefined;
                        const promptIndex = message && message.type === 'user' && originalIndex !== undefined
                            ? getPromptIndexForMessage(originalIndex)
                            : undefined;

                        return (
                            <motion.div
                                key={virtualItem.key}
                                data-index={virtualItem.index}
                                ref={(el) => el && rowVirtualizer.measureElement(el)}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                transition={{ duration: 0.3 }}
                                className="absolute inset-x-4"
                                style={{
                                    top: virtualItem.start,
                                }}
                            >
                                <StreamMessageV2
                                    messageGroup={messageGroup}
                                    onLinkDetected={onLinkDetected}
                                    claudeSettings={claudeSettings}
                                    isStreaming={virtualItem.index === messageGroups.length - 1 && isLoading}
                                    promptIndex={promptIndex}
                                    sessionId={session?.id}
                                    projectId={session?.project_id}
                                    onRevert={onRevert}
                                />
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>
        </div>
    );
};
