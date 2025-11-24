import React, { useState, useEffect } from "react";
import MDEditor from "@uiw/react-md-editor";
import { motion } from "framer-motion";
import { ArrowLeft, Save, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toast, ToastContainer } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface CodexMarkdownEditorProps {
  /**
   * Callback to go back to the main view
   */
  onBack: () => void;
  /**
   * Optional className for styling
   */
  className?: string;
}

/**
 * CodexMarkdownEditor component for editing the AGENTS.md system prompt
 *
 * @example
 * <CodexMarkdownEditor onBack={() => setView('main')} />
 */
export const CodexMarkdownEditor: React.FC<CodexMarkdownEditorProps> = ({
  onBack,
  className,
}) => {
  const [content, setContent] = useState<string>("");
  const [originalContent, setOriginalContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [codexNotInstalled, setCodexNotInstalled] = useState(false);

  const hasChanges = content !== originalContent;

  // Load the Codex system prompt on mount
  useEffect(() => {
    loadCodexSystemPrompt();
  }, []);

  const loadCodexSystemPrompt = async () => {
    try {
      setLoading(true);
      setError(null);
      setCodexNotInstalled(false);
      const prompt = await api.getCodexSystemPrompt();
      setContent(prompt);
      setOriginalContent(prompt);
    } catch (err) {
      console.error("Failed to load Codex system prompt:", err);
      const errorMessage = err instanceof Error ? err.message : String(err);

      // Check if error is about Codex not being installed
      if (errorMessage.includes("Codex 目录") || errorMessage.includes("Codex CLI")) {
        setCodexNotInstalled(true);
        setError("未找到 Codex 目录。请确保已安装 Codex CLI。");
      } else {
        setError("无法加载 AGENTS.md 文件");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setToast(null);
      await api.saveCodexSystemPrompt(content);
      setOriginalContent(content);
      setToast({ message: "AGENTS.md 保存成功", type: "success" });
    } catch (err) {
      console.error("Failed to save Codex system prompt:", err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`保存失败: ${errorMessage}`);
      setToast({ message: "保存 AGENTS.md 失败", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (hasChanges) {
      const confirmLeave = window.confirm(
        "您有未保存的更改。确定要离开吗？"
      );
      if (!confirmLeave) return;
    }
    onBack();
  };

  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
      <div className="w-full max-w-5xl mx-auto flex flex-col h-full">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex items-center justify-between p-4 border-b border-border"
        >
          <div className="flex items-center space-x-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBack}
              className="h-8 w-8"
              aria-label="返回"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <div>
              <h2 className="text-lg font-semibold">Codex AGENTS.md</h2>
              <p className="text-xs text-muted-foreground">
                编辑 Codex 系统提示词配置
              </p>
            </div>
          </div>

          <Button
            onClick={handleSave}
            disabled={!hasChanges || saving || codexNotInstalled}
            size="sm"
            className={cn(
              "transition-all duration-200",
              saving && "scale-95 opacity-80"
            )}
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            {saving ? "保存中..." : "保存"}
          </Button>
        </motion.div>

        {/* Error display */}
        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={cn(
              "mx-4 mt-4 rounded-lg border p-3 text-xs",
              codexNotInstalled
                ? "border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                : "border-destructive/50 bg-destructive/10 text-destructive"
            )}
          >
            <div className="flex items-start space-x-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-medium">{error}</p>
                {codexNotInstalled && (
                  <p className="mt-1 text-xs opacity-90">
                    Codex CLI 安装后会自动创建 ~/.codex 目录。
                    <br />
                    请访问 Codex 官网下载并安装 CLI 工具。
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Editor */}
        <div className="flex-1 p-4 overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full space-y-3">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">加载 AGENTS.md...</p>
            </div>
          ) : codexNotInstalled ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-3 max-w-md">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-500/10 mb-2">
                  <AlertCircle className="h-8 w-8 text-amber-600 dark:text-amber-400" />
                </div>
                <h3 className="text-lg font-semibold">未安装 Codex CLI</h3>
                <p className="text-sm text-muted-foreground">
                  无法找到 ~/.codex 目录。请先安装 Codex CLI 以使用此功能。
                </p>
              </div>
            </div>
          ) : (
            <div className="h-full rounded-lg border border-border overflow-hidden shadow-sm" data-color-mode="dark">
              <MDEditor
                value={content}
                onChange={(val) => setContent(val || "")}
                preview="edit"
                height="100%"
                visibleDragbar={false}
              />
            </div>
          )}
        </div>
      </div>

      {/* Toast Notification */}
      <ToastContainer>
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onDismiss={() => setToast(null)}
          />
        )}
      </ToastContainer>
    </div>
  );
};
