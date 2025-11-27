import React, { forwardRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatePresence } from "framer-motion";
import { FilePicker } from "../FilePicker";
import { SlashCommandPicker } from "../SlashCommandPicker";

interface InputAreaProps {
  prompt: string;
  disabled?: boolean;
  dragActive: boolean;
  showFilePicker: boolean;
  showSlashCommandPicker: boolean;
  projectPath?: string;
  filePickerQuery: string;
  slashCommandQuery: string;
  disableSlashCommands?: boolean; // 禁用斜杠命令（用于 Codex 模式）
  onTextChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onPaste: (e: React.ClipboardEvent) => void;
  onDragEnter: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onExpand: () => void;
  onFileSelect: (file: any) => void;
  onFilePickerClose: () => void;
  onSlashCommandSelect: (cmd: any) => void;
  onSlashCommandPickerClose: () => void;
}

export const InputArea = forwardRef<HTMLTextAreaElement, InputAreaProps>(({
  prompt,
  disabled,
  dragActive,
  showFilePicker,
  showSlashCommandPicker,
  projectPath,
  filePickerQuery,
  slashCommandQuery,
  disableSlashCommands,
  onTextChange,
  onKeyDown,
  onPaste,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  onExpand,
  onFileSelect,
  onFilePickerClose,
  onSlashCommandSelect,
  onSlashCommandPickerClose
}, ref) => {
  return (
    <div className="relative">
      <Textarea
        ref={ref}
        value={prompt}
        onChange={onTextChange}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        placeholder={dragActive ? "拖放图片到这里..." : "向 Claude 提问..."}
        disabled={disabled}
        className={cn(
          "min-h-[56px] max-h-[300px] resize-none pr-10 overflow-y-auto",
          "bg-background/50 backdrop-blur-sm border-border/50 focus:border-primary/50 focus:ring-primary/20",
          dragActive && "border-primary ring-2 ring-primary/20"
        )}
        rows={1}
        style={{ height: 'auto' }}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
      />

      <Button
        variant="ghost"
        size="icon"
        onClick={onExpand}
        disabled={disabled}
        className="absolute right-1 bottom-1 h-8 w-8 text-muted-foreground hover:text-foreground"
        aria-label="展开输入框"
      >
        <Maximize2 className="h-4 w-4" aria-hidden="true" />
      </Button>

      {/* File Picker */}
      <AnimatePresence>
        {showFilePicker && projectPath && projectPath.trim() && (
          <FilePicker
            basePath={projectPath.trim()}
            onSelect={onFileSelect}
            onClose={onFilePickerClose}
            initialQuery={filePickerQuery}
          />
        )}
      </AnimatePresence>

      {/* Slash Command Picker - 在 Codex 模式下禁用 */}
      <AnimatePresence>
        {showSlashCommandPicker && !disableSlashCommands && (
          <SlashCommandPicker
            projectPath={projectPath}
            onSelect={onSlashCommandSelect}
            onClose={onSlashCommandPickerClose}
            initialQuery={slashCommandQuery}
          />
        )}
      </AnimatePresence>
    </div>
  );
});

InputArea.displayName = "InputArea";