import { useState } from "react";
import { type FileEntry } from "@/lib/api";

export interface UseFileSelectionOptions {
  prompt: string;
  projectPath?: string;
  cursorPosition: number;
  isExpanded: boolean;
  onPromptChange: (newPrompt: string) => void;
  onCursorPositionChange: (pos: number) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  expandedTextareaRef: React.RefObject<HTMLTextAreaElement>;
}

export function useFileSelection({
  prompt,
  projectPath,
  cursorPosition,
  isExpanded,
  onPromptChange,
  onCursorPositionChange,
  textareaRef,
  expandedTextareaRef,
}: UseFileSelectionOptions) {
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [filePickerQuery, setFilePickerQuery] = useState("");

  // Detect @ symbol for file picker
  const detectAtSymbol = (newValue: string, newCursorPosition: number) => {
    if (projectPath?.trim() && newValue.length > prompt.length && newValue[newCursorPosition - 1] === '@') {
      console.log('[useFileSelection] @ detected, projectPath:', projectPath);
      setShowFilePicker(true);
      setFilePickerQuery("");
      onCursorPositionChange(newCursorPosition);
    }
  };

  // Update file picker query as user types after @
  const updateFilePickerQuery = (newValue: string, newCursorPosition: number) => {
    if (!showFilePicker || newCursorPosition < cursorPosition) return;

    // Find the @ position before cursor
    let atPosition = -1;
    for (let i = newCursorPosition - 1; i >= 0; i--) {
      if (newValue[i] === '@') {
        atPosition = i;
        break;
      }
      // Stop if we hit whitespace
      if (newValue[i] === ' ' || newValue[i] === '\n') {
        break;
      }
    }

    if (atPosition !== -1) {
      const query = newValue.substring(atPosition + 1, newCursorPosition);
      setFilePickerQuery(query);
    } else {
      // @ was removed or cursor moved away
      setShowFilePicker(false);
      setFilePickerQuery("");
    }
  };

  // Handle file selection from picker
  const handleFileSelect = (entry: FileEntry) => {
    const textarea = isExpanded ? expandedTextareaRef.current : textareaRef.current;
    if (!textarea) return;

    // Find the @ position before cursor
    let atPosition = -1;
    for (let i = cursorPosition - 1; i >= 0; i--) {
      if (prompt[i] === '@') {
        atPosition = i;
        break;
      }
    }

    if (atPosition === -1) {
      setShowFilePicker(false);
      setFilePickerQuery("");
      return;
    }

    const beforeAt = prompt.substring(0, atPosition);
    const afterCursor = prompt.substring(cursorPosition);
    
    // Use relative path if projectPath is set
    const relativePath = (projectPath && entry.path.startsWith(projectPath))
      ? entry.path.slice((projectPath || '').length + 1)
      : entry.path;
    
    const newPrompt = `${beforeAt}@${relativePath} ${afterCursor}`;
    onPromptChange(newPrompt);
    setShowFilePicker(false);
    setFilePickerQuery("");
    
    // Focus back on textarea and set cursor position
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = beforeAt.length + relativePath.length + 2; // +2 for @ and space
      textarea.setSelectionRange(newCursorPos, newCursorPos);
      onCursorPositionChange(newCursorPos);
    }, 0);
  };

  // Close file picker
  const handleFilePickerClose = () => {
    setShowFilePicker(false);
    setFilePickerQuery("");
    
    // Return focus to textarea
    setTimeout(() => {
      const textarea = isExpanded ? expandedTextareaRef.current : textareaRef.current;
      textarea?.focus();
    }, 0);
  };

  return {
    showFilePicker,
    filePickerQuery,
    detectAtSymbol,
    updateFilePickerQuery,
    handleFileSelect,
    handleFilePickerClose,
    setShowFilePicker,
    setFilePickerQuery,
  };
}
