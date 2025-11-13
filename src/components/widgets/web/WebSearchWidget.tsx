/**
 * ✅ WebSearch Widget - 网络搜索展示
 *
 * 迁移并拆分自 ToolWidgets.tsx (原 2553-2760 行)
 * 主组件 (~100行) + SearchResults 子组件 (~100行)
 */

import React, { useState } from "react";
import { Globe, AlertCircle } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import ReactMarkdown from "react-markdown";
import { SearchResults, SearchLink } from "./components/SearchResults";

export interface WebSearchWidgetProps {
  /** 搜索查询 */
  query: string;
  /** 工具结果 */
  result?: any;
}

interface ParsedSection {
  type: 'text' | 'links';
  content: string | SearchLink[];
}

/**
 * 网络搜索 Widget
 *
 * Features:
 * - 解析搜索结果的多段落结构
 * - 提取和展示链接
 * - 支持展开/折叠视图
 */
export const WebSearchWidget: React.FC<WebSearchWidgetProps> = ({
  query,
  result,
}) => {
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());

  /**
   * 解析搜索结果，提取文本和链接部分
   */
  const parseSearchResult = (resultContent: string): ParsedSection[] => {
    const sections: ParsedSection[] = [];

    // 按 "Links: [" 分割，找到所有链接部分
    const parts = resultContent.split(/Links:\s*\[/);

    // 第一部分总是文本
    if (parts[0]) {
      sections.push({ type: 'text', content: parts[0].trim() });
    }

    // 处理每个链接部分
    parts.slice(1).forEach(part => {
      try {
        // 找到结束括号
        const closingIndex = part.indexOf(']');
        if (closingIndex === -1) return;

        const linksJson = '[' + part.substring(0, closingIndex + 1);
        const remainingText = part.substring(closingIndex + 1).trim();

        // 解析 JSON 数组
        const links = JSON.parse(linksJson);
        sections.push({ type: 'links', content: links });

        // 添加剩余文本
        if (remainingText) {
          sections.push({ type: 'text', content: remainingText });
        }
      } catch (e) {
        // 解析失败，作为文本处理
        sections.push({ type: 'text', content: 'Links: [' + part });
      }
    });

    return sections;
  };

  const toggleSection = (index: number) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedSections(newExpanded);
  };

  // 提取并解析结果
  let searchResults: {
    sections: ParsedSection[];
    noResults: boolean;
  } = { sections: [], noResults: false };

  if (result) {
    let resultContent = '';
    if (typeof result.content === 'string') {
      resultContent = result.content;
    } else if (result.content && typeof result.content === 'object') {
      if (result.content.text) {
        resultContent = result.content.text;
      } else if (Array.isArray(result.content)) {
        resultContent = result.content
          .map((c: any) => (typeof c === 'string' ? c : c.text || JSON.stringify(c)))
          .join('\n');
      } else {
        resultContent = JSON.stringify(result.content, null, 2);
      }
    }

    searchResults.noResults = resultContent.toLowerCase().includes('no links found') ||
                               resultContent.toLowerCase().includes('no results');
    searchResults.sections = parseSearchResult(resultContent);
  }

  const handleLinkClick = async (url: string) => {
    try {
      await open(url);
    } catch (error) {
      console.error('Failed to open URL:', error);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {/* 搜索查询头部 */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/5 border border-blue-500/10">
        <Globe className="h-4 w-4 text-blue-500/70" />
        <span className="text-xs font-medium uppercase tracking-wider text-blue-600/70 dark:text-blue-400/70">Web 搜索</span>
        <span className="text-sm text-muted-foreground/80 flex-1 truncate">{query}</span>
      </div>

      {/* 结果展示 */}
      {result && (
        <div className="rounded-lg border bg-background/50 backdrop-blur-sm overflow-hidden">
          {!searchResults.sections.length ? (
            // 加载中
            <div className="px-3 py-2 flex items-center gap-2 text-muted-foreground">
              <div className="animate-pulse flex items-center gap-1">
                <div className="h-1 w-1 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                <div className="h-1 w-1 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="h-1 w-1 bg-blue-500 rounded-full animate-bounce"></div>
              </div>
              <span className="text-sm">搜索中...</span>
            </div>
          ) : searchResults.noResults ? (
            // 无结果
            <div className="px-3 py-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">未找到结果</span>
              </div>
            </div>
          ) : (
            // 有结果
            <div className="p-3 space-y-3">
              {searchResults.sections.map((section, idx) => {
                if (section.type === 'text') {
                  return (
                    <div key={idx} className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown>{section.content as string}</ReactMarkdown>
                    </div>
                  );
                } else if (section.type === 'links' && Array.isArray(section.content)) {
                  return (
                    <SearchResults
                      key={idx}
                      links={section.content as SearchLink[]}
                      isExpanded={expandedSections.has(idx)}
                      onToggle={() => toggleSection(idx)}
                      onLinkClick={handleLinkClick}
                    />
                  );
                }
                return null;
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
