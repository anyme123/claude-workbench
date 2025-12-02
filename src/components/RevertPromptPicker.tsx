/**
 * RevertPromptPicker - 撤回提示词选择器
 *
 * 按两次 ESC 键时显示，允许用户选择要撤回的提示词
 * 智能识别每个提示词的撤回能力（CLI/项目界面）
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, ArrowLeft, MessageSquare, X, Terminal, FolderGit2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import type { RewindMode, RewindCapabilities } from '@/lib/api';

interface PromptEntry {
  /** 提示词索引（从0开始，后端分配的准确索引） */
  index: number;
  /** 提示词内容 */
  content: string;
  /** 提示词预览（截断后的内容） */
  preview: string;
  /** 来源（project 或 cli） */
  source: string;
  /** 撤回能力（异步加载） */
  capabilities?: RewindCapabilities;
  /** 加载状态 */
  loading: boolean;
}

interface RevertPromptPickerProps {
  /** 会话ID */
  sessionId: string;
  /** 项目ID */
  projectId: string;
  /** 会话引擎（claude/codex/gemini），用于选择正确的撤回接口 */
  engine?: 'claude' | 'codex' | 'gemini';
  /** 选择回调 */
  onSelect: (promptIndex: number, mode: RewindMode) => void;
  /** 关闭回调 */
  onClose: () => void;
  /** 可选的样式类名 */
  className?: string;
}

/**
 * 截断文本用于预览
 */
const truncateText = (text: string, maxLength: number = 80): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

/**
 * RevertPromptPicker 组件
 */
export const RevertPromptPicker: React.FC<RevertPromptPickerProps> = ({
  sessionId,
  projectId,
  engine = 'claude',
  onSelect,
  onClose,
  className,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedMode, setSelectedMode] = useState<RewindMode>('both');
  const [prompts, setPrompts] = useState<PromptEntry[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLDivElement>(null);
  const isCodex = engine === 'codex';

  // 从后端加载准确的提示词列表
  useEffect(() => {
    const loadPrompts = async () => {
      try {
        // 调用后端获取准确的提示词列表（包含正确的 index）
        const promptRecords = isCodex
          ? await api.getCodexPromptList(sessionId)
          : await api.getPromptList(sessionId, projectId);

        console.log('[RevertPromptPicker] Loaded prompts from backend:', promptRecords);

        if (promptRecords.length === 0) {
          console.log('[RevertPromptPicker] No prompts to revert, closing');
          onClose();
          return;
        }

        // 转换为 PromptEntry 格式
        const promptEntries: PromptEntry[] = promptRecords.map((record) => ({
          index: record.index,  // 使用后端返回的准确索引
          content: record.text,
          preview: truncateText(record.text),
          source: record.source,
          loading: true,
        }));

        setPrompts(promptEntries);
      } catch (error) {
        console.error('[RevertPromptPicker] Failed to load prompts:', error);
        onClose();
      }
    };

    loadPrompts();
  }, [sessionId, projectId, onClose, isCodex]);

  // 异步加载每个提示词的撤回能力
  useEffect(() => {
    const loadCapabilities = async () => {
      for (const prompt of prompts) {
        if (prompt.loading && !prompt.capabilities) {
          try {
            const capabilities = isCodex
              ? await api.checkCodexRewindCapabilities(sessionId, prompt.index)
              : await api.checkRewindCapabilities(
                  sessionId,
                  projectId,
                  prompt.index
                );

            setPrompts(prev =>
              prev.map(p =>
                p.index === prompt.index
                  ? { ...p, capabilities, loading: false }
                  : p
              )
            );
          } catch (error) {
            console.error(`Failed to load capabilities for prompt #${prompt.index}:`, error);
            // 失败时设置默认能力（仅对话）
            setPrompts(prev =>
              prev.map(p =>
                p.index === prompt.index
                  ? {
                      ...p,
                      capabilities: {
                        conversation: true,
                        code: false,
                        both: false,
                        warning: '无法获取撤回能力信息',
                        source: 'cli',
                      },
                      loading: false,
                    }
                  : p
              )
            );
          }
        }
      }
    };

    if (prompts.length > 0) {
      loadCapabilities();
    }
  }, [prompts, sessionId, projectId, isCodex]);

  // 当前选中提示词的撤回能力
  const currentCapabilities = useMemo(() => {
    return prompts[selectedIndex]?.capabilities;
  }, [prompts, selectedIndex]);

  // 根据当前选中提示词的能力，自动调整选中的模式
  useEffect(() => {
    if (!currentCapabilities) return;

    // 如果当前模式不可用，自动切换到可用模式
    if (selectedMode === 'code_only' && !currentCapabilities.code) {
      setSelectedMode('conversation_only');
    } else if (selectedMode === 'both' && !currentCapabilities.both) {
      if (currentCapabilities.code) {
        setSelectedMode('code_only');
      } else {
        setSelectedMode('conversation_only');
      }
    }
  }, [currentCapabilities, selectedMode]);

  // 滚动到选中项
  useEffect(() => {
    if (selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [selectedIndex]);

  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          onClose();
          break;

        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => Math.max(0, prev - 1));
          break;

        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => Math.min(prompts.length - 1, prev + 1));
          break;

        case 'Enter':
          e.preventDefault();
          if (prompts[selectedIndex] && currentCapabilities) {
            // 验证模式是否可用
            if (
              (selectedMode === 'conversation_only' && currentCapabilities.conversation) ||
              (selectedMode === 'code_only' && currentCapabilities.code) ||
              (selectedMode === 'both' && currentCapabilities.both)
            ) {
              onSelect(prompts[selectedIndex].index, selectedMode);
              onClose();
            }
          }
          break;

        case '1':
          e.preventDefault();
          if (currentCapabilities?.conversation) {
            setSelectedMode('conversation_only');
          }
          break;

        case '2':
          e.preventDefault();
          if (currentCapabilities?.code) {
            setSelectedMode('code_only');
          }
          break;

        case '3':
          e.preventDefault();
          if (currentCapabilities?.both) {
            setSelectedMode('both');
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => document.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [prompts, selectedIndex, selectedMode, currentCapabilities, onSelect, onClose]);

  if (prompts.length === 0) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={cn(
          'fixed inset-0 z-50 flex items-center justify-center bg-black/50',
          className
        )}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="relative w-full max-w-3xl max-h-[80vh] bg-white dark:bg-gray-900 rounded-lg shadow-2xl flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 标题栏 */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                选择要撤回的提示词
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>
          </div>

          {/* 撤回模式选择 */}
          <div className="px-6 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              撤回模式：
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => currentCapabilities?.conversation && setSelectedMode('conversation_only')}
                disabled={!currentCapabilities?.conversation}
                className={cn(
                  'flex-1 px-3 py-2 text-sm rounded-md transition-colors',
                  selectedMode === 'conversation_only'
                    ? 'bg-blue-500 text-white'
                    : currentCapabilities?.conversation
                    ? 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
                    : 'bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed opacity-50'
                )}
              >
                <span className="font-mono text-xs mr-1">[1]</span>
                仅删除对话
              </button>
              <button
                onClick={() => currentCapabilities?.code && setSelectedMode('code_only')}
                disabled={!currentCapabilities?.code}
                className={cn(
                  'flex-1 px-3 py-2 text-sm rounded-md transition-colors',
                  selectedMode === 'code_only'
                    ? 'bg-blue-500 text-white'
                    : currentCapabilities?.code
                    ? 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
                    : 'bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed opacity-50'
                )}
              >
                <span className="font-mono text-xs mr-1">[2]</span>
                仅回滚代码
              </button>
              <button
                onClick={() => currentCapabilities?.both && setSelectedMode('both')}
                disabled={!currentCapabilities?.both}
                className={cn(
                  'flex-1 px-3 py-2 text-sm rounded-md transition-colors',
                  selectedMode === 'both'
                    ? 'bg-blue-500 text-white'
                    : currentCapabilities?.both
                    ? 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
                    : 'bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed opacity-50'
                )}
              >
                <span className="font-mono text-xs mr-1">[3]</span>
                对话 + 代码
              </button>
            </div>

            {/* 警告信息 */}
            {currentCapabilities?.warning && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-3 flex items-start gap-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md"
              >
                <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  {currentCapabilities.warning}
                </p>
              </motion.div>
            )}
          </div>

          {/* 提示词列表 */}
          <div
            ref={listRef}
            className="flex-1 overflow-y-auto px-6 py-4 space-y-2"
          >
            {prompts.map((prompt, idx) => (
              <div
                key={prompt.index}
                ref={idx === selectedIndex ? selectedItemRef : null}
                className={cn(
                  'p-4 rounded-lg border cursor-pointer transition-all',
                  idx === selectedIndex
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-md'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                )}
                onClick={() => {
                  setSelectedIndex(idx);
                }}
                onDoubleClick={() => {
                  if (prompt.capabilities) {
                    // 双击时使用当前可用的最佳模式
                    let mode: RewindMode = 'conversation_only';
                    if (prompt.capabilities.both) {
                      mode = 'both';
                    } else if (prompt.capabilities.code) {
                      mode = 'code_only';
                    }
                    onSelect(prompt.index, mode);
                    onClose();
                  }
                }}
              >
                <div className="flex items-start gap-3">
                  <MessageSquare className="w-5 h-5 text-gray-500 dark:text-gray-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                        提示词 #{prompt.index + 1}
                      </span>

                      {/* 来源标记 */}
                      {prompt.capabilities && (
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium',
                            prompt.capabilities.source === 'project'
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                          )}
                        >
                          {prompt.capabilities.source === 'project' ? (
                            <>
                              <FolderGit2 className="w-3 h-3" />
                              项目
                            </>
                          ) : (
                            <>
                              <Terminal className="w-3 h-3" />
                              CLI
                            </>
                          )}
                        </span>
                      )}

                      <Clock className="w-3 h-3 text-gray-400 dark:text-gray-500" />
                    </div>
                    <p className="text-sm text-gray-900 dark:text-gray-100 break-words">
                      {prompt.preview}
                    </p>

                    {/* 能力指示器 */}
                    {prompt.capabilities && (
                      <div className="mt-2 flex items-center gap-2 text-xs">
                        <span className="text-gray-500 dark:text-gray-400">可撤回：</span>
                        {prompt.capabilities.conversation && (
                          <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
                            对话
                          </span>
                        )}
                        {prompt.capabilities.code && (
                          <span className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded">
                            代码
                          </span>
                        )}
                      </div>
                    )}

                    {/* 加载中 */}
                    {prompt.loading && (
                      <div className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                        加载撤回能力...
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 底部提示 */}
          <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
              <p>
                <span className="font-mono">↑↓</span> 上下移动 |{' '}
                <span className="font-mono">Enter</span> 确认 |{' '}
                <span className="font-mono">ESC</span> 取消 |{' '}
                <span className="font-mono">1/2/3</span> 切换模式
              </p>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
