/**
 * ✅ Search Results Component - 搜索结果展示子组件
 *
 * 从 WebSearchWidget 中提取，用于展示搜索结果的链接列表
 */

import React from "react";
import { Globe2, ChevronRight, ChevronDown } from "lucide-react";

export interface SearchLink {
  title: string;
  url: string;
}

export interface SearchResultsProps {
  /** 链接列表 */
  links: SearchLink[];
  /** 是否展开 */
  isExpanded: boolean;
  /** 切换展开/折叠 */
  onToggle: () => void;
  /** 链接点击回调 */
  onLinkClick: (url: string) => void;
}

/**
 * 搜索结果展示组件
 *
 * 支持两种视图模式：
 * - 展开模式：卡片列表视图
 * - 折叠模式：标签云视图
 */
export const SearchResults: React.FC<SearchResultsProps> = ({
  links,
  isExpanded,
  onToggle,
  onLinkClick,
}) => {
  return (
    <div className="space-y-1.5">
      {/* 切换按钮 */}
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <span>{links.length} 个结果</span>
      </button>

      {isExpanded ? (
        // 展开视图：卡片列表
        <div className="grid gap-1.5 ml-4">
          {links.map((link, idx) => (
            <button
              key={idx}
              onClick={() => onLinkClick(link.url)}
              className="group flex flex-col gap-0.5 p-2.5 rounded-md border bg-card/30 hover:bg-card/50 hover:border-blue-500/30 transition-all text-left"
            >
              <div className="flex items-start gap-2">
                <Globe2 className="h-3.5 w-3.5 text-blue-500/70 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium group-hover:text-blue-500 transition-colors line-clamp-2">
                    {link.title}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">
                    {link.url}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        // 折叠视图：标签云
        <div className="flex flex-wrap gap-1.5 ml-4">
          {links.map((link, idx) => (
            <button
              key={idx}
              onClick={(e) => {
                e.stopPropagation();
                onLinkClick(link.url);
              }}
              className="group inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/5 hover:bg-blue-500/10 border border-blue-500/10 hover:border-blue-500/20 transition-all"
            >
              <Globe2 className="h-3 w-3 text-blue-500/70" />
              <span className="truncate max-w-[180px] text-foreground/70 group-hover:text-foreground/90">
                {link.title}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
