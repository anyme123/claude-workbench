import React, { useState } from "react";
import { Globe, Globe2, AlertCircle, ChevronDown, ChevronRight, Info, FileText } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { open } from "@tauri-apps/plugin-shell";
import { cn } from "@/lib/utils";
export const WebSearchWidget: React.FC<{ 
  query: string; 
  result?: any;
}> = ({ query, result }) => {
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());
  
  // Parse the result to extract all links sections and build a structured representation
  const parseSearchResult = (resultContent: string) => {
    const sections: Array<{
      type: 'text' | 'links';
      content: string | Array<{ title: string; url: string }>;
    }> = [];
    
    // Split by "Links: [" to find all link sections
    const parts = resultContent.split(/Links:\s*\[/);
    
    // First part is always text (or empty)
    if (parts[0]) {
      sections.push({ type: 'text', content: parts[0].trim() });
    }
    
    // Process each links section
    parts.slice(1).forEach(part => {
      try {
        // Find the closing bracket
        const closingIndex = part.indexOf(']');
        if (closingIndex === -1) return;
        
        const linksJson = '[' + part.substring(0, closingIndex + 1);
        const remainingText = part.substring(closingIndex + 1).trim();
        
        // Parse the JSON array
        const links = JSON.parse(linksJson);
        sections.push({ type: 'links', content: links });
        
        // Add any remaining text
        if (remainingText) {
          sections.push({ type: 'text', content: remainingText });
        }
      } catch (e) {
        // If parsing fails, treat it as text
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
  
  // Extract result content if available
  let searchResults: {
    sections: Array<{
      type: 'text' | 'links';
      content: string | Array<{ title: string; url: string }>;
    }>;
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
      {/* Subtle Search Query Header */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/5 border border-blue-500/10">
        <Globe className="h-4 w-4 text-blue-500/70" />
        <span className="text-xs font-medium uppercase tracking-wider text-blue-600/70 dark:text-blue-400/70">Web 搜索</span>
        <span className="text-sm text-muted-foreground/80 flex-1 truncate">{query}</span>
      </div>
      
      {/* Results */}
      {result && (
        <div className="rounded-lg border bg-background/50 backdrop-blur-sm overflow-hidden">
          {!searchResults.sections.length ? (
            <div className="px-3 py-2 flex items-center gap-2 text-muted-foreground">
              <div className="animate-pulse flex items-center gap-1">
                <div className="h-1 w-1 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                <div className="h-1 w-1 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="h-1 w-1 bg-blue-500 rounded-full animate-bounce"></div>
              </div>
              <span className="text-sm">搜索中...</span>
            </div>
          ) : searchResults.noResults ? (
            <div className="px-3 py-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">未找到结果</span>
              </div>
            </div>
          ) : (
            <div className="p-3 space-y-3">
              {searchResults.sections.map((section, idx) => {
                if (section.type === 'text') {
                  return (
                    <div key={idx} className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown>{section.content as string}</ReactMarkdown>
                    </div>
                  );
                } else if (section.type === 'links' && Array.isArray(section.content)) {
                  const links = section.content;
                  const isExpanded = expandedSections.has(idx);
                  
                  return (
                    <div key={idx} className="space-y-1.5">
                      {/* Toggle Button */}
                      <button
                        onClick={() => toggleSection(idx)}
                        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                        <span>{links.length} 个结果{links.length !== 1 ? '' : ''}</span>
                      </button>
                      
                      {/* Links Display */}
                      {isExpanded ? (
                        /* Expanded Card View */
                        <div className="grid gap-1.5 ml-4">
                          {links.map((link, linkIdx) => (
                            <button
                              key={linkIdx}
                              onClick={() => handleLinkClick(link.url)}
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
                        /* Collapsed Pills View */
                        <div className="flex flex-wrap gap-1.5 ml-4">
                          {links.map((link, linkIdx) => (
                            <button
                              key={linkIdx}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleLinkClick(link.url);
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

/**
 * Widget for displaying AI thinking/reasoning content with translation support
 * Directly shows thinking results when available
 */

export const WebFetchWidget: React.FC<{
  url: string;
  prompt?: string;
  result?: any;
}> = ({ url, prompt, result }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isContentExpanded, setIsContentExpanded] = useState(false);
  
  // Extract result content if available
  let fetchedContent = '';
  let isLoading = !result;
  let hasError = false;
  
  if (result) {
    if (typeof result.content === 'string') {
      fetchedContent = result.content;
    } else if (result.content && typeof result.content === 'object') {
      if (result.content.text) {
        fetchedContent = result.content.text;
      } else if (Array.isArray(result.content)) {
        fetchedContent = result.content
          .map((c: any) => (typeof c === 'string' ? c : c.text || JSON.stringify(c)))
          .join('\n');
      } else {
        fetchedContent = JSON.stringify(result.content, null, 2);
      }
    }
    
    // Check if there's an error
    hasError = result.is_error || 
               fetchedContent.toLowerCase().includes('error') ||
               fetchedContent.toLowerCase().includes('failed');
  }
  
  // Truncate content for preview
  const maxPreviewLength = 500;
  const isTruncated = fetchedContent.length > maxPreviewLength;
  const previewContent = isTruncated && !isContentExpanded
    ? fetchedContent.substring(0, maxPreviewLength) + '...'
    : fetchedContent;
  
  // Extract domain from URL for display
  const getDomain = (urlString: string) => {
    try {
      const urlObj = new URL(urlString);
      return urlObj.hostname;
    } catch {
      return urlString;
    }
  };
  
  const handleUrlClick = async () => {
    try {
      await open(url);
    } catch (error) {
      console.error('Failed to open URL:', error);
    }
  };
  
  return (
    <div className="flex flex-col gap-2">
      {/* Header with URL and optional prompt */}
      <div className="space-y-2">
        {/* URL Display */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-500/5 border border-purple-500/10">
          <Globe className="h-4 w-4 text-purple-500/70" />
          <span className="text-xs font-medium uppercase tracking-wider text-purple-600/70 dark:text-purple-400/70">获取中</span>
          <button
            onClick={handleUrlClick}
            className="text-sm text-foreground/80 hover:text-foreground flex-1 truncate text-left hover:underline decoration-purple-500/50"
          >
            {url}
          </button>
        </div>
        
        {/* Prompt Display */}
        {prompt && (
          <div className="ml-6 space-y-1">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-90")} />
              <Info className="h-3 w-3" />
              <span>分析提示</span>
            </button>
            
            {isExpanded && (
              <div className="rounded-lg border bg-muted/30 p-3 ml-4">
                <p className="text-sm text-foreground/90">
                  {prompt}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Results */}
      {isLoading ? (
        <div className="rounded-lg border bg-background/50 backdrop-blur-sm overflow-hidden">
          <div className="px-3 py-2 flex items-center gap-2 text-muted-foreground">
            <div className="animate-pulse flex items-center gap-1">
              <div className="h-1 w-1 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
              <div className="h-1 w-1 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
              <div className="h-1 w-1 bg-purple-500 rounded-full animate-bounce"></div>
            </div>
            <span className="text-sm">从 {getDomain(url)} 获取内容中...</span>
          </div>
        </div>
      ) : fetchedContent ? (
        <div className="rounded-lg border bg-background/50 backdrop-blur-sm overflow-hidden">
          {hasError ? (
            <div className="px-3 py-2">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm font-medium">无法获取内容</span>
              </div>
              <pre className="mt-2 text-xs font-mono text-muted-foreground whitespace-pre-wrap">
                {fetchedContent}
              </pre>
            </div>
          ) : (
            <div className="p-3 space-y-2">
              {/* Content Header */}
              <div className="px-4 py-2 border-b bg-zinc-700/30 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" />
                  <span>从 {getDomain(url)} 获取的内容</span>
                </div>
                {isTruncated && (
                  <button
                    onClick={() => setIsContentExpanded(!isContentExpanded)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ChevronRight className={cn("h-3 w-3 transition-transform", isContentExpanded && "rotate-90")} />
                    <span>{isContentExpanded ? '收起' : '展开'}</span>
                  </button>
                )}
              </div>
              
              {/* Fetched Content */}
              {(!isTruncated || isContentExpanded) && (
                <div className="relative">
                  <div className="rounded-lg bg-muted/30 p-3 overflow-hidden">
                    <pre className="text-sm font-mono text-foreground/90 whitespace-pre-wrap">
                      {previewContent}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border bg-background/50 backdrop-blur-sm overflow-hidden">
          <div className="px-3 py-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Info className="h-4 w-4" />
              <span className="text-sm">没有返回内容</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Widget for TodoRead tool - displays todos with advanced viewing capabilities
 */
