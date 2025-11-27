import { useState } from "react";
import { type SlashCommand } from "@/lib/api";

export interface UseSlashCommandsOptions {
  prompt: string;
  cursorPosition: number;
  isExpanded: boolean;
  onPromptChange: (newPrompt: string) => void;
  onCursorPositionChange: (pos: number) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  expandedTextareaRef: React.RefObject<HTMLTextAreaElement>;
  disabled?: boolean; // 禁用斜杠命令（用于 Codex 模式）
}

export function useSlashCommands({
  prompt,
  cursorPosition,
  isExpanded,
  onPromptChange,
  onCursorPositionChange,
  textareaRef,
  expandedTextareaRef,
  disabled = false,
}: UseSlashCommandsOptions) {
  const [showSlashCommandPicker, setShowSlashCommandPicker] = useState(false);
  const [slashCommandQuery, setSlashCommandQuery] = useState("");

  // Detect / symbol for slash command picker
  const detectSlashSymbol = (newValue: string, newCursorPosition: number) => {
    // 在 Codex 模式下禁用斜杠命令检测
    if (disabled) return;

    if (newValue.length > prompt.length && newValue[newCursorPosition - 1] === '/') {
      // Check if it's at the start or after whitespace
      const isStartOfCommand = newCursorPosition === 1 ||
        (newCursorPosition > 1 && /\s/.test(newValue[newCursorPosition - 2]));

      if (isStartOfCommand) {
        console.log('[useSlashCommands] / detected for slash command');
        setShowSlashCommandPicker(true);
        setSlashCommandQuery("");
        onCursorPositionChange(newCursorPosition);
      }
    }
  };

  // Update slash command query as user types after /
  const updateSlashCommandQuery = (newValue: string, newCursorPosition: number) => {
    if (!showSlashCommandPicker || newCursorPosition < cursorPosition) return;

    // Find the / position before cursor
    let slashPosition = -1;
    for (let i = newCursorPosition - 1; i >= 0; i--) {
      if (newValue[i] === '/') {
        slashPosition = i;
        break;
      }
      // Stop if we hit whitespace (new word)
      if (newValue[i] === ' ' || newValue[i] === '\n') {
        break;
      }
    }

    if (slashPosition !== -1) {
      const query = newValue.substring(slashPosition + 1, newCursorPosition);
      setSlashCommandQuery(query);
    } else {
      // / was removed or cursor moved away
      setShowSlashCommandPicker(false);
      setSlashCommandQuery("");
    }
  };

  // Handle slash command selection
  const handleSlashCommandSelect = (command: SlashCommand) => {
    const textarea = isExpanded ? expandedTextareaRef.current : textareaRef.current;
    if (!textarea) return;

    // Find the / position before cursor
    let slashPosition = -1;
    for (let i = cursorPosition - 1; i >= 0; i--) {
      if (prompt[i] === '/') {
        slashPosition = i;
        break;
      }
    }

    if (slashPosition === -1) {
      setShowSlashCommandPicker(false);
      setSlashCommandQuery("");
      return;
    }

    const beforeSlash = prompt.substring(0, slashPosition);
    const afterCursor = prompt.substring(cursorPosition);

    if (command.accepts_arguments) {
      // Insert command with placeholder for arguments
      const newPrompt = `${beforeSlash}${command.full_command} `;
      onPromptChange(newPrompt);
      setShowSlashCommandPicker(false);
      setSlashCommandQuery("");
      
      // Focus and position cursor after the command
      setTimeout(() => {
        textarea.focus();
        const newCursorPos = newPrompt.length;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
        onCursorPositionChange(newCursorPos);
      }, 0);
    } else {
      // Insert command and close picker
      const newPrompt = `${beforeSlash}${command.full_command} ${afterCursor}`;
      onPromptChange(newPrompt);
      setShowSlashCommandPicker(false);
      setSlashCommandQuery("");
      
      // Focus and position cursor after the command
      setTimeout(() => {
        textarea.focus();
        const newCursorPos = beforeSlash.length + command.full_command.length + 1;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
        onCursorPositionChange(newCursorPos);
      }, 0);
    }
  };

  // Close slash command picker
  const handleSlashCommandPickerClose = () => {
    setShowSlashCommandPicker(false);
    setSlashCommandQuery("");
    
    // Return focus to textarea
    setTimeout(() => {
      const textarea = isExpanded ? expandedTextareaRef.current : textareaRef.current;
      textarea?.focus();
    }, 0);
  };

  return {
    showSlashCommandPicker,
    slashCommandQuery,
    detectSlashSymbol,
    updateSlashCommandQuery,
    handleSlashCommandSelect,
    handleSlashCommandPickerClose,
    setShowSlashCommandPicker,
    setSlashCommandQuery,
  };
}
