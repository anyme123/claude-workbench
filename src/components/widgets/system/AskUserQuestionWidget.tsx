/**
 * AskUserQuestion Widget - 用户问题询问展示
 *
 * 用于展示 Claude 向用户提问的交互式对话框
 * 显示问题列表和用户的回答
 */

import React from "react";
import { HelpCircle, CheckCircle, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

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
 * AskUserQuestion Widget
 *
 * 展示 Claude 向用户提问的内容和用户的回答
 */
export const AskUserQuestionWidget: React.FC<AskUserQuestionWidgetProps> = ({
  questions = [],
  answers = {},
  result,
}) => {
  const isError = result?.is_error;
  const hasAnswers = Object.keys(answers).length > 0;

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
      <div className="px-4 py-3 flex items-start gap-3">
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

        {/* 内容 */}
        <div className="flex-1 space-y-3">
          {/* 标题 */}
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
          </div>

          {/* 问题列表 */}
          {questions.length > 0 && (
            <div className="space-y-3">
              {questions.map((q, index) => (
                <div
                  key={index}
                  className="p-3 rounded-md bg-background/50 border border-border/50 space-y-2"
                >
                  {/* 问题文本 */}
                  <div className="flex items-start gap-2">
                    <MessageCircle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      {q.header && (
                        <div className="text-xs font-medium text-primary mb-1">
                          {q.header}
                        </div>
                      )}
                      <div className="text-sm text-foreground">{q.question}</div>
                    </div>
                  </div>

                  {/* 选项列表 */}
                  {q.options && q.options.length > 0 && (
                    <div className="pl-6 space-y-1.5">
                      {q.options.map((option, optIndex) => (
                        <div
                          key={optIndex}
                          className="text-xs p-2 rounded bg-muted/30"
                        >
                          <div className="font-medium text-foreground">
                            {option.label}
                          </div>
                          {option.description && (
                            <div className="text-muted-foreground mt-0.5">
                              {option.description}
                            </div>
                          )}
                        </div>
                      ))}
                      {q.multiSelect && (
                        <div className="text-xs text-muted-foreground mt-1">
                          ℹ️ 可以选择多个选项
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 用户答案 */}
          {hasAnswers && (
            <div className="p-3 rounded-md bg-green-500/10 border border-green-500/20">
              <div className="text-xs font-medium text-green-700 dark:text-green-300 mb-2">
                用户回答：
              </div>
              <div className="space-y-1.5">
                {Object.entries(answers).map(([key, value], index) => (
                  <div key={index} className="text-sm">
                    <span className="font-medium text-green-700 dark:text-green-300">
                      {key}:
                    </span>{" "}
                    <span className="text-foreground">
                      {Array.isArray(value) ? value.join(", ") : value}
                    </span>
                  </div>
                ))}
              </div>
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

          {/* 结果消息 */}
          {!isError && result?.content && typeof result.content === "string" && (
            <div className="text-xs text-muted-foreground">{result.content}</div>
          )}
        </div>
      </div>
    </div>
  );
};
