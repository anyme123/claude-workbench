/**
 * ✅ Todo Widget - 任务列表展示
 *
 * 迁移自 ToolWidgets.tsx (原 113-194 行)
 * 用于展示 Todo 列表和任务状态
 */

import React from "react";
import { CheckCircle2, Clock, Circle, FileEdit } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useToolTranslation } from "../common/useToolTranslation";

export interface TodoWidgetProps {
  /** 任务列表 */
  todos: any[];
  /** 工具结果 */
  result?: any;
}

/**
 * Todo 列表 Widget
 *
 * 展示任务列表，支持状态图标和优先级显示，带翻译支持
 */
export const TodoWidget: React.FC<TodoWidgetProps> = ({ todos, result: _result }) => {
  const { translateContent } = useToolTranslation();
  const [translatedTodos, setTranslatedTodos] = React.useState<Map<string, string>>(new Map());

  const statusIcons = {
    completed: <CheckCircle2 className="h-4 w-4 text-success" />,
    in_progress: <Clock className="h-4 w-4 text-info animate-pulse" />,
    pending: <Circle className="h-4 w-4 text-muted-foreground" />
  };

  const priorityColors = {
    high: "bg-destructive/10 text-destructive border-destructive/20",
    medium: "bg-warning/10 text-warning border-warning/20",
    low: "bg-success/10 text-success border-success/20"
  };

  // 获取 todo 的文本内容（兼容 Claude 的 content 和 Gemini 的 description）
  const getTodoText = (todo: any): string => {
    return todo.content || todo.description || '';
  };

  // 翻译 todo 内容
  React.useEffect(() => {
    const translateTodos = async () => {
      const translations = new Map<string, string>();

      for (const [idx, todo] of todos.entries()) {
        const text = getTodoText(todo);
        if (text) {
          const cacheKey = `todo-${idx}-${text.substring(0, 50)}`;
          const translatedContent = await translateContent(text, cacheKey);
          translations.set(cacheKey, translatedContent);
        }
      }

      setTranslatedTodos(translations);
    };

    if (todos.length > 0) {
      translateTodos();
    }
  }, [todos, translateContent]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <FileEdit className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">任务列表</span>
      </div>
      <div className="space-y-2">
        {todos.map((todo, idx) => {
          const text = getTodoText(todo);
          const cacheKey = `todo-${idx}-${text.substring(0, 50)}`;
          const displayContent = translatedTodos.get(cacheKey) || text;

          return (
            <div
              key={todo.id || idx}
              className={cn(
                "flex items-start gap-3 p-3 rounded-lg border bg-card/50",
                todo.status === "completed" && "opacity-60"
              )}
            >
              <div className="mt-0.5">
                {statusIcons[todo.status as keyof typeof statusIcons] || statusIcons.pending}
              </div>
              <div className="flex-1 space-y-1">
                <p className={cn(
                  "text-sm",
                  todo.status === "completed" && "line-through"
                )}>
                  {displayContent}
                </p>
                {todo.priority && (
                  <Badge
                    variant="outline"
                    className={cn("text-xs", priorityColors[todo.priority as keyof typeof priorityColors])}
                  >
                    {todo.priority}
                  </Badge>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
