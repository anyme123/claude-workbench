/**
 * ✅ LS Result Widget - 目录树结果展示
 *
 * 迁移自 ToolWidgets.tsx (原 251-417 行)
 * 用于展示目录结构树，支持文件夹折叠和文件类型图标
 */

import React, { useState } from "react";
import { FolderOpen, Folder, FileText, FileCode, Terminal, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LSResultWidgetProps {
  /** 目录内容字符串 */
  content: string;
}

interface DirectoryEntry {
  path: string;
  name: string;
  type: 'file' | 'directory';
  level: number;
}

/**
 * 目录树结果 Widget
 *
 * Features:
 * - 解析目录树结构
 * - 可折叠的文件夹
 * - 基于文件类型的图标
 */
export const LSResultWidget: React.FC<LSResultWidgetProps> = ({ content }) => {
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  /**
   * 解析目录树结构
   * 支持多种格式:
   * 1. Claude Code 树形格式 (带 "- " 前缀)
   * 2. Gemini 简单列表格式 ("Directory listing for...\nFile1\nFile2")
   * 3. 纯文件列表 (每行一个文件名)
   * 4. JSON 格式 (数组或对象)
   */
  const parseDirectoryTree = (rawContent: string): DirectoryEntry[] => {
    const trimmedContent = rawContent.trim();
    const entries: DirectoryEntry[] = [];

    // 尝试解析 JSON 格式
    if (trimmedContent.startsWith('[') || trimmedContent.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmedContent);
        const items = Array.isArray(parsed) ? parsed : (parsed.files || parsed.entries || []);
        if (Array.isArray(items)) {
          items.forEach((item: any) => {
            const name = typeof item === 'string' ? item : (item.name || item.path || String(item));
            const isDirectory = name.endsWith('/') ||
              item.type === 'directory' ||
              item.isDirectory === true;
            entries.push({
              path: name.replace(/\/$/, ''),
              name: name.replace(/\/$/, ''),
              type: isDirectory ? 'directory' : 'file',
              level: 0,
            });
          });
          return entries;
        }
      } catch {
        // JSON 解析失败，继续尝试其他格式
      }
    }

    const lines = rawContent.split('\n');
    let currentPath: string[] = [];
    let isGeminiFormat = false;
    let isPlainList = false;

    // 检测格式类型
    if (lines.length > 0) {
      const firstLine = lines[0].trim();
      if (firstLine.startsWith('Directory listing for')) {
        isGeminiFormat = true;
      } else if (!firstLine.startsWith('-') && !firstLine.match(/^\s+-/)) {
        // 第一行不是以 "- " 开头，可能是纯文件列表
        isPlainList = true;
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 跳过 NOTE 部分
      if (line.startsWith('NOTE:')) {
        break;
      }

      // 跳过空行
      if (!line.trim()) continue;

      // Gemini 格式: "Directory listing for...\nFile1\nFile2"
      if (isGeminiFormat) {
        // 跳过 "Directory listing for..." 行
        if (line.trim().startsWith('Directory listing for')) {
          continue;
        }

        // 每行是一个文件或目录名
        const name = line.trim();
        if (!name) continue;

        // 检测是否是目录 (Gemini 使用 [DIR] 前缀 或以 / 结尾)
        const isDirMatch = name.match(/^\[DIR\]\s*(.+)$/);
        const isDirectory = !!isDirMatch || name.endsWith('/');
        const cleanName = isDirMatch ? isDirMatch[1] : name.replace(/\/$/, '');

        entries.push({
          path: cleanName,
          name: cleanName,
          type: isDirectory ? 'directory' : 'file',
          level: 0,
        });
        continue;
      }

      // 纯文件列表格式
      if (isPlainList) {
        const name = line.trim();
        if (!name) continue;

        // 检测是否是目录
        const isDirectory = name.endsWith('/');
        const cleanName = name.replace(/\/$/, '');

        entries.push({
          path: cleanName,
          name: cleanName,
          type: isDirectory ? 'directory' : 'file',
          level: 0,
        });
        continue;
      }

      // Claude Code 树形格式
      // 计算缩进级别
      const indent = line.match(/^(\s*)/)?.[1] || '';
      const level = Math.floor(indent.length / 2);

      // 提取条目名称
      const entryMatch = line.match(/^\s*-\s+(.+?)(\/$)?$/);
      if (!entryMatch) continue;

      const fullName = entryMatch[1];
      const isDirectory = line.trim().endsWith('/');
      const name = fullName;

      // 根据级别更新当前路径
      currentPath = currentPath.slice(0, level);
      currentPath.push(name);

      entries.push({
        path: currentPath.join('/'),
        name,
        type: isDirectory ? 'directory' : 'file',
        level,
      });
    }

    return entries;
  };

  const entries = parseDirectoryTree(content);

  /**
   * 切换文件夹展开/折叠状态
   */
  const toggleDirectory = (path: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  /**
   * 获取指定父路径的直接子项
   */
  const getChildren = (parentPath: string, parentLevel: number) => {
    return entries.filter(e => {
      if (e.level !== parentLevel + 1) return false;
      const parentParts = parentPath.split('/').filter(Boolean);
      const entryParts = e.path.split('/').filter(Boolean);

      // 检查是否是直接子项
      if (entryParts.length !== parentParts.length + 1) return false;

      // 检查所有父级部分是否匹配
      for (let i = 0; i < parentParts.length; i++) {
        if (parentParts[i] !== entryParts[i]) return false;
      }

      return true;
    });
  };

  /**
   * 根据文件类型获取图标
   */
  const getFileIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'rs':
        return <FileCode className="h-3.5 w-3.5 text-orange-500" />;
      case 'toml':
      case 'yaml':
      case 'yml':
      case 'json':
        return <FileText className="h-3.5 w-3.5 text-yellow-500" />;
      case 'md':
        return <FileText className="h-3.5 w-3.5 text-blue-400" />;
      case 'js':
      case 'jsx':
      case 'ts':
      case 'tsx':
        return <FileCode className="h-3.5 w-3.5 text-yellow-400" />;
      case 'py':
        return <FileCode className="h-3.5 w-3.5 text-blue-500" />;
      case 'go':
        return <FileCode className="h-3.5 w-3.5 text-cyan-500" />;
      case 'sh':
      case 'bash':
        return <Terminal className="h-3.5 w-3.5 text-green-500" />;
      default:
        return <FileText className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  /**
   * 渲染单个条目（递归）
   */
  const renderEntry = (entry: DirectoryEntry, isRoot = false): React.ReactNode => {
    const hasChildren = entry.type === 'directory' &&
      entries.some(e => e.path.startsWith(entry.path + '/') && e.level === entry.level + 1);
    const isExpanded = expandedDirs.has(entry.path) || isRoot;

    const icon = entry.type === 'directory'
      ? isExpanded
        ? <FolderOpen className="h-3.5 w-3.5 text-blue-500" />
        : <Folder className="h-3.5 w-3.5 text-blue-500" />
      : getFileIcon(entry.name);

    return (
      <div key={entry.path}>
        <div
          className={cn(
            "flex items-center gap-2 py-1 px-2 rounded hover:bg-muted/50 transition-colors cursor-pointer",
            !isRoot && "ml-4"
          )}
          onClick={() => entry.type === 'directory' && hasChildren && toggleDirectory(entry.path)}
        >
          {entry.type === 'directory' && hasChildren && (
            <ChevronRight className={cn(
              "h-3 w-3 text-muted-foreground transition-transform",
              isExpanded && "rotate-90"
            )} />
          )}
          {(!hasChildren || entry.type !== 'directory') && (
            <div className="w-3" />
          )}
          {icon}
          <span className="text-sm font-mono">{entry.name}</span>
        </div>

        {entry.type === 'directory' && hasChildren && isExpanded && (
          <div className="ml-2">
            {getChildren(entry.path, entry.level).map(child => renderEntry(child))}
          </div>
        )}
      </div>
    );
  };

  // 获取根条目
  const rootEntries = entries.filter(e => e.level === 0);

  // 如果解析后没有条目，显示原始内容
  if (rootEntries.length === 0) {
    // 检查是否有内容但解析失败
    const hasContent = content.trim().length > 0;

    if (hasContent) {
      // 显示原始内容作为 fallback
      return (
        <div className="rounded-lg border bg-muted/20 p-3">
          <pre className="text-xs font-mono whitespace-pre-wrap break-words text-muted-foreground">
            {content}
          </pre>
        </div>
      );
    }

    // 完全没有内容
    return (
      <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
        目录为空
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="space-y-1">
        {rootEntries.map(entry => renderEntry(entry, true))}
      </div>
    </div>
  );
};
