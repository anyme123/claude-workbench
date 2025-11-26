import React, { forwardRef } from "react";
import { motion } from "framer-motion";
import { Minimize2, X, Wand2, ChevronDown, Code2, Zap, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { ImagePreview } from "../ImagePreview";
import { ExecutionEngineSelector, type ExecutionEngineConfig } from "@/components/ExecutionEngineSelector";
import { ModelSelector } from "./ModelSelector";
import { ThinkingModeToggle } from "./ThinkingModeToggle";
import { PlanModeToggle } from "./PlanModeToggle";
import { ModelType, ModelConfig } from "./types";

interface ExpandedModalProps {
  prompt: string;
  disabled?: boolean;
  imageAttachments: Array<{ id: string; previewUrl: string; filePath: string }>;
  embeddedImages: Array<any>;
  executionEngineConfig: ExecutionEngineConfig;
  setExecutionEngineConfig: (config: ExecutionEngineConfig) => void;
  selectedModel: ModelType;
  setSelectedModel: (model: ModelType) => void;
  availableModels: ModelConfig[];
  selectedThinkingMode: string;
  handleToggleThinkingMode: () => void;
  isPlanMode?: boolean;
  onTogglePlanMode?: () => void;
  isEnhancing: boolean;
  projectPath?: string;
  enableProjectContext: boolean;
  setEnableProjectContext: (enable: boolean) => void;
  enableDualAPI: boolean;
  setEnableDualAPI: (enable: boolean) => void;
  getEnabledProviders: () => any[];
  handleEnhancePromptWithAPI: (id: string) => void;
  onClose: () => void;
  onRemoveAttachment: (id: string) => void;
  onRemoveEmbedded: (index: number) => void;
  onTextChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onPaste: (e: React.ClipboardEvent) => void;
  onDragEnter: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onSend: () => void;
}

export const ExpandedModal = forwardRef<HTMLTextAreaElement, ExpandedModalProps>(({
  prompt,
  disabled,
  imageAttachments,
  embeddedImages,
  executionEngineConfig,
  setExecutionEngineConfig,
  selectedModel,
  setSelectedModel,
  availableModels,
  selectedThinkingMode,
  handleToggleThinkingMode,
  isPlanMode,
  onTogglePlanMode,
  isEnhancing,
  projectPath,
  enableProjectContext,
  setEnableProjectContext,
  enableDualAPI,
  setEnableDualAPI,
  getEnabledProviders,
  handleEnhancePromptWithAPI,
  onClose,
  onRemoveAttachment,
  onRemoveEmbedded,
  onTextChange,
  onPaste,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  onSend
}, ref) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-background border border-border rounded-lg shadow-lg w-full max-w-2xl p-4 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">编写提示词</h3>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8"
          >
            <Minimize2 className="h-4 w-4" />
          </Button>
        </div>

        {/* Image attachments preview */}
        {imageAttachments.length > 0 && (
          <div className="border-t border-border pt-2">
            <div className="text-sm font-medium mb-2">附件预览</div>
            <div className="flex gap-2 overflow-x-auto">
              {imageAttachments.map((attachment) => (
                <div key={attachment.id} className="relative flex-shrink-0 group">
                  <div className="relative w-16 h-16 rounded-md overflow-hidden border border-border">
                    <img
                      src={attachment.previewUrl}
                      alt="Screenshot preview"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <button
                        onClick={() => onRemoveAttachment(attachment.id)}
                        className="w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center hover:bg-destructive/90 transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Embedded images preview */}
        {embeddedImages.length > 0 && (
          <ImagePreview
            images={embeddedImages}
            onRemove={onRemoveEmbedded}
            className="border-t border-border pt-2"
          />
        )}

        <Textarea
          ref={ref}
          value={prompt}
          onChange={onTextChange}
          onPaste={onPaste}
          placeholder="输入您的提示词..."
          className="min-h-[240px] max-h-[600px] resize-none overflow-y-auto"
          disabled={disabled}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDrop={onDrop}
        />

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Execution Engine Selector */}
            <ExecutionEngineSelector
              value={executionEngineConfig}
              onChange={setExecutionEngineConfig}
            />

            {/* Only show model selector for Claude Code */}
            {executionEngineConfig.engine === 'claude' && (
              <>
                <ModelSelector
                  selectedModel={selectedModel}
                  onModelChange={setSelectedModel}
                  disabled={disabled}
                  availableModels={availableModels}
                />
                <ThinkingModeToggle
                  isEnabled={selectedThinkingMode === "on"}
                  onToggle={handleToggleThinkingMode}
                  disabled={disabled}
                />
                {onTogglePlanMode && (
                  <PlanModeToggle
                    isPlanMode={isPlanMode || false}
                    onToggle={onTogglePlanMode}
                    disabled={disabled}
                  />
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Enhance Button in Expanded Mode */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="default"
                  disabled={disabled || isEnhancing}
                  className="gap-2"
                >
                  <Wand2 className="h-4 w-4" />
                  {isEnhancing ? "优化中..." : "优化提示词"}
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                {/* 项目上下文开关 */}
                {projectPath && (
                  <>
                    <div className="px-2 py-1.5">
                      <label className="flex items-center justify-between cursor-pointer">
                        <div className="flex items-center gap-2">
                          <Code2 className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">启用项目上下文</span>
                        </div>
                        <Switch
                          checked={enableProjectContext}
                          onCheckedChange={setEnableProjectContext}
                        />
                      </label>
                      <p className="text-xs text-muted-foreground mt-1 ml-6">
                        使用 acemcp 搜索相关代码
                      </p>
                    </div>
                    <DropdownMenuSeparator />
                  </>
                )}

                {/* 智能上下文提取开关 */}
                <div className="px-2 py-1.5">
                  <label className="flex items-center justify-between cursor-pointer">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">智能上下文提取</span>
                    </div>
                    <Switch
                      checked={enableDualAPI}
                      onCheckedChange={(checked) => {
                        setEnableDualAPI(checked);
                        localStorage.setItem('enable_dual_api_enhancement', String(checked));
                      }}
                    />
                  </label>
                  <p className="text-xs text-muted-foreground mt-1 ml-6">
                    AI 智能筛选相关消息（提升 40% 准确性）
                  </p>
                </div>
                <DropdownMenuSeparator />

                {/* 第三方API提供商 */}
                {(() => {
                  const enabledProviders = getEnabledProviders();
                  if (enabledProviders.length > 0) {
                    return (
                      <>
                        <DropdownMenuSeparator />
                        {enabledProviders.map((provider) => (
                          <DropdownMenuItem
                            key={provider.id}
                            onClick={() => handleEnhancePromptWithAPI(provider.id)}
                          >
                            {provider.name}
                          </DropdownMenuItem>
                        ))}
                      </>
                    );
                  }
                  return null;
                })()}

                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => window.dispatchEvent(new CustomEvent('open-prompt-api-settings'))}>
                  <Settings className="h-3 w-3 mr-2" />
                  管理API配置
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              onClick={onSend}
              disabled={!prompt.trim() || disabled}
              size="default"
            >
              发送
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
});

ExpandedModal.displayName = "ExpandedModal";