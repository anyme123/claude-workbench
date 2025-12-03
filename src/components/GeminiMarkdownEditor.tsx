import React, { useState, useEffect } from "react";
import MDEditor from "@uiw/react-md-editor";
import { motion } from "framer-motion";
import { ArrowLeft, Save, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toast, ToastContainer } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface GeminiMarkdownEditorProps {
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
 * GeminiMarkdownEditor component for editing the GEMINI.md system prompt
 *
 * @example
 * <GeminiMarkdownEditor onBack={() => setView('main')} />
 */
export const GeminiMarkdownEditor: React.FC<GeminiMarkdownEditorProps> = ({
  onBack,
  className,
}) => {
  const [content, setContent] = useState<string>("");
  const [originalContent, setOriginalContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const hasChanges = content !== originalContent;

  // Load the Gemini system prompt on mount
  useEffect(() => {
    loadGeminiSystemPrompt();
  }, []);

  const loadGeminiSystemPrompt = async () => {
    try {
      setLoading(true);
      setError(null);
      const prompt = await api.getGeminiSystemPrompt();
      setContent(prompt);
      setOriginalContent(prompt);
    } catch (err) {
      console.error("Failed to load Gemini system prompt:", err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`无法加载 GEMINI.md 文件: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setToast(null);
      await api.saveGeminiSystemPrompt(content);
      setOriginalContent(content);
      setToast({ message: "GEMINI.md 保存成功", type: "success" });
    } catch (err) {
      console.error("Failed to save Gemini system prompt:", err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`保存失败: ${errorMessage}`);
      setToast({ message: "保存 GEMINI.md 失败", type: "error" });
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
              <h2 className="text-lg font-semibold">Gemini GEMINI.md</h2>
              <p className="text-xs text-muted-foreground">
                编辑 Gemini 系统提示词配置
              </p>
            </div>
          </div>

          <Button
            onClick={handleSave}
            disabled={!hasChanges || saving}
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
            className="mx-4 mt-4 rounded-lg border border-destructive/50 bg-destructive/10 text-destructive p-3 text-xs"
          >
            <div className="flex items-start space-x-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-medium">{error}</p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Editor */}
        <div className="flex-1 p-4 overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full space-y-3">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">加载 GEMINI.md...</p>
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
