/**
 * AskUserQuestion Widget - 用户问题询问展示
 *
 * V3 改进版本：
 * - 添加折叠/展开功能
 * - 优化UI布局，更紧凑的设计
 * - 在选项上直接显示用户的选择（高亮）
 * - 完全隐藏底部的result.content冗余信息
 * - 添加问题统计信息
 */

import React, { useState, useMemo } from "react";
import { HelpCircle, CheckCircle, MessageCircle, ChevronDown, ChevronUp, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface AskUserQuestionWidgetProps {
  /** 问题列表 */
  questions?: Array<{
    /** 问题文本 */
    question: string;
    /** 问题头部（简短标签） */
    header?: string;
    /** 选项列表 */
    options?: Array<{
      label: string;
      description?: string;
    }>;
    /** 是否支持多选 */
    multiSelect?: boolean;
  }>;
  /** 用户答案 */
  answers?: Record<string, string | string[]>;
  /** 工具执行结果 */
  result?: {
    content?: any;
    is_error?: boolean;
  };
}

/**
 * 规范化文本（用于匹配）
 * 去除多余空格、统一标点符号
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ') // 多个空格替换为单个
    .replace(/[，。！？：；""''（）【】]/g, (char) => {
      // 中文标点转英文标点
      const map: Record<string, string> = {
        '，': ',', '。': '.', '！': '!', '？': '?',
        '：': ':', '；': ';', '"': '"', '"': '"',
        ''': "'", ''': "'", '（': '(', '）': ')',
        '【': '[', '】': ']'
      };
      return map[char] || char;
    })
    .trim();
}

/**
 * 检查选项是否被选中（改进版）
 */
function isOptionSelected(
  optionLabel: string,
  answer: string | string[] | undefined
): boolean {
  if (!answer) return false;

  const normalizedOption = normalizeText(optionLabel);

  if (Array.isArray(answer)) {
    // 多选：检查是否在数组中
    return answer.some(a => {
      const normalizedAnswer = normalizeText(a);
      return normalizedOption.includes(normalizedAnswer) ||
             normalizedAnswer.includes(normalizedOption) ||
             normalizedOption === normalizedAnswer;
    });
  } else {
    // 单选：规范化后匹配
    const normalizedAnswer = normalizeText(answer);
    return normalizedOption.includes(normalizedAnswer) ||
           normalizedAnswer.includes(normalizedOption) ||
           normalizedOption === normalizedAnswer;
  }
}

/**
 * AskUserQuestion Widget V3
 *
 * 展示 Claude 向用户提问的内容和用户的回答
 * 支持折叠/展开功能，在选项上直接显示选中状态
 */
export const AskUserQuestionWidget: React.FC<AskUserQuestionWidgetProps> = ({
  questions = [],
  answers = {},
  result,
}) => {
  const isError = result?.is_error;
  const hasAnswers = Object.keys(answers).length > 0;

  // 折叠状态：已回答时默认折叠，未回答时默认展开
  const [isCollapsed, setIsCollapsed] = useState(hasAnswers);

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  // 🐛 调试：打印answers数据结构
  React.useEffect(() => {
    if (hasAnswers) {
      console.log('[AskUserQuestion] Answers:', answers);
      console.log('[AskUserQuestion] Questions:', questions.map(q => ({
        header: q.header,
        question: q.question,
      })));
    }
  }, [answers, questions, hasAnswers]);

  // 构建问题到答案的映射
  const questionAnswerMap = useMemo(() => {
    const map = new Map<string, string | string[]>();

    questions.forEach((q) => {
      // 尝试完全匹配
      if (answers[q.question]) {
        map.set(q.header || q.question, answers[q.question]);
        console.log(`[AskUserQuestion] ✓ Exact match: "${q.question}" -> "${answers[q.question]}"`);
        return;
      }

      // 尝试规范化匹配（处理标点符号差异）
      const normalizedQuestion = normalizeText(q.question);
      for (const [answerKey, answerValue] of Object.entries(answers)) {
        const normalizedKey = normalizeText(answerKey);

        // 完全匹配或高相似度匹配
        if (normalizedQuestion === normalizedKey ||
            normalizedQuestion.includes(normalizedKey) ||
            normalizedKey.includes(normalizedQuestion)) {
          map.set(q.header || q.question, answerValue);
          console.log(`[AskUserQuestion] ✓ Normalized match: "${answerKey}" -> "${answerValue}"`);
          return;
        }
      }

      // 如果还是没匹配到，尝试header匹配
      if (q.header && answers[q.header]) {
        map.set(q.header || q.question, answers[q.header]);
        console.log(`[AskUserQuestion] ✓ Header match: "${q.header}" -> "${answers[q.header]}"`);
      }
    });

    if (map.size === 0 && hasAnswers) {
      console.warn('[AskUserQuestion] ⚠️ No matches found!');
      console.log('[AskUserQuestion] Available answer keys:', Object.keys(answers));
      console.log('[AskUserQuestion] Question texts:', questions.map(q => q.question));
    }

    return map;
  }, [questions, answers, hasAnswers]);

  return (
    <div
      className={cn(
        "rounded-lg border overflow-hidden",
        isError
          ? "border-destructive/20 bg-destructive/5"
          : hasAnswers
            ? "border-green-500/20 bg-green-500/5"
            : "border-blue-500/20 bg-blue-500/5"
      )}
    >
      {/* 头部：可点击折叠/展开 */}
      <div
        className="px-4 py-3 flex items-start gap-3 cursor-pointer hover:bg-background/30 transition-colors"
        onClick={toggleCollapse}
      >
        {/* 图标 */}
        <div className="mt-0.5">
          <div
            className={cn(
              "h-8 w-8 rounded-full flex items-center justify-center",
              isError
                ? "bg-destructive/10"
                : hasAnswers
                  ? "bg-green-500/20"
                  : "bg-blue-500/10"
            )}
          >
            {hasAnswers ? (
              <CheckCircle
                className={cn(
                  "h-4 w-4",
                  isError ? "text-destructive" : "text-green-600"
                )}
              />
            ) : (
              <HelpCircle className="h-4 w-4 text-blue-500" />
            )}
          </div>
        </div>

        {/* 标题和摘要 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "text-xs font-medium",
                  isError
                    ? "text-destructive"
                    : hasAnswers
                      ? "text-green-600"
                      : "text-blue-500"
                )}
              >
                {hasAnswers ? "用户已回答问题" : "Claude 正在询问用户"}
              </span>
              {questions.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  ({questions.length} 个问题)
                </span>
              )}
            </div>

            {/* 折叠按钮 */}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={(e) => {
                e.stopPropagation();
                toggleCollapse();
              }}
            >
              {isCollapsed ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronUp className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* 折叠时显示的简要信息 */}
          {isCollapsed && hasAnswers && (
            <div className="mt-1 text-xs text-muted-foreground truncate">
              {Object.entries(answers).slice(0, 2).map(([key, value]) => {
                const displayValue = Array.isArray(value) ? value.join(", ") : value;
                return `${key}: ${displayValue}`;
              }).join(" | ")}
              {Object.keys(answers).length > 2 && ` +${Object.keys(answers).length - 2}...`}
            </div>
          )}
        </div>
      </div>

      {/* 展开的内容 */}
      {!isCollapsed && (
        <div className="px-4 pb-3 space-y-3 border-t border-border/30">
          {/* 问题列表 */}
          {questions.length > 0 && (
            <div className="space-y-2 pt-3">
              {questions.map((q, qIndex) => {
                // 获取这个问题的答案
                const questionKey = q.header || q.question;
                const answer = questionAnswerMap.get(questionKey);
                const hasAnswer = !!answer;

                return (
                  <div
                    key={qIndex}
                    className={cn(
                      "p-3 rounded-md border space-y-2",
                      hasAnswer
                        ? "bg-green-500/5 border-green-500/20"
                        : "bg-background/50 border-border/50"
                    )}
                  >
                    {/* 问题文本 */}
                    <div className="flex items-start gap-2">
                      <MessageCircle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        {q.header && (
                          <div className="text-xs font-medium text-primary mb-1 flex items-center gap-2">
                            <span>{q.header}</span>
                            {hasAnswer && (
                              <CheckCircle className="h-3 w-3 text-green-600" />
                            )}
                          </div>
                        )}
                        <div className="text-sm text-foreground">{q.question}</div>
                      </div>
                    </div>

                    {/* 选项列表 */}
                    {q.options && q.options.length > 0 && (
                      <div className="pl-6 space-y-1.5">
                        {q.options.map((option, optIndex) => {
                          const isSelected = isOptionSelected(option.label, answer);

                          return (
                            <div
                              key={optIndex}
                              className={cn(
                                "text-xs p-2.5 rounded-md transition-all relative",
                                isSelected
                                  ? "bg-green-500/15 border-2 border-green-500/40 shadow-md"
                                  : "bg-muted/30 hover:bg-muted/50 border border-transparent"
                              )}
                            >
                              <div className="flex items-start gap-2.5">
                                {/* 选中徽章 */}
                                {isSelected ? (
                                  <div className="flex-shrink-0 h-5 w-5 rounded-full bg-green-500 flex items-center justify-center shadow-sm">
                                    <Check className="h-3.5 w-3.5 text-white font-bold" strokeWidth={3} />
                                  </div>
                                ) : (
                                  <div className="flex-shrink-0 h-5 w-5 rounded-full border-2 border-muted-foreground/30 bg-background" />
                                )}
                                <div className="flex-1 pt-0.5">
                                  <div className="flex items-center gap-2">
                                    <div
                                      className={cn(
                                        "font-medium",
                                        isSelected
                                          ? "text-green-700 dark:text-green-300"
                                          : "text-foreground"
                                      )}
                                    >
                                      {option.label}
                                    </div>
                                    {/* 选中标签 */}
                                    {isSelected && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-green-500 text-white shadow-sm">
                                        已选择
                                      </span>
                                    )}
                                  </div>
                                  {option.description && (
                                    <div
                                      className={cn(
                                        "mt-0.5",
                                        isSelected
                                          ? "text-green-600 dark:text-green-400"
                                          : "text-muted-foreground"
                                      )}
                                    >
                                      {option.description}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {q.multiSelect && (
                          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                            <span className="text-blue-500">ℹ️</span>
                            <span>支持多选</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* 错误信息 */}
          {isError && result?.content && (
            <div className="p-2 rounded bg-destructive/10 text-xs text-destructive">
              {typeof result.content === "string"
                ? result.content
                : JSON.stringify(result.content)}
            </div>
          )}

          {/* 完全隐藏result.content，因为答案已经在选项上显示 */}
        </div>
      )}
    </div>
  );
};
