/**
 * Claude 主题的语法高亮主题
 * 采用橙色、紫色和紫罗兰色以匹配 Claude 的美学风格
 * Claude-themed syntax highlighting themes
 * Features orange, purple, and violet colors to match Claude's aesthetic
 *
 * ✨ 优化对比度以提高黑色背景下的可读性
 */

// 深色主题（默认）
// Dark theme (default)
export const claudeSyntaxTheme: any = {
  'code[class*="language-"]': {
    color: '#f3f4f6',
    background: 'transparent',
    textShadow: 'none',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.875em',
    textAlign: 'left',
    whiteSpace: 'pre',
    wordSpacing: 'normal',
    wordBreak: 'normal',
    wordWrap: 'normal',
    lineHeight: '1.5',
    MozTabSize: '4',
    OTabSize: '4',
    tabSize: '4',
    WebkitHyphens: 'none',
    MozHyphens: 'none',
    msHyphens: 'none',
    hyphens: 'none',
  },
  'pre[class*="language-"]': {
    color: '#f3f4f6',
    background: 'transparent',
    textShadow: 'none',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.875em',
    textAlign: 'left',
    whiteSpace: 'pre',
    wordSpacing: 'normal',
    wordBreak: 'normal',
    wordWrap: 'normal',
    lineHeight: '1.5',
    MozTabSize: '4',
    OTabSize: '4',
    tabSize: '4',
    WebkitHyphens: 'none',
    MozHyphens: 'none',
    msHyphens: 'none',
    hyphens: 'none',
    padding: '1em',
    margin: '0',
    overflow: 'auto',
  },
  ':not(pre) > code[class*="language-"]': {
    background: 'rgba(139, 92, 246, 0.1)',
    padding: '0.1em 0.3em',
    borderRadius: '0.3em',
    whiteSpace: 'normal',
  },
  'comment': {
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  'prolog': {
    color: '#9ca3af',
  },
  'doctype': {
    color: '#9ca3af',
  },
  'cdata': {
    color: '#9ca3af',
  },
  'punctuation': {
    color: '#d1d5db',
  },
  'namespace': {
    opacity: '0.7',
  },
  'property': {
    color: '#fbbf24', // Brighter Amber/Orange
  },
  'tag': {
    color: '#a78bfa', // Brighter Violet
  },
  'boolean': {
    color: '#fbbf24', // Brighter Amber/Orange
  },
  'number': {
    color: '#fbbf24', // Brighter Amber/Orange
  },
  'constant': {
    color: '#fbbf24', // Brighter Amber/Orange
  },
  'symbol': {
    color: '#fbbf24', // Brighter Amber/Orange
  },
  'deleted': {
    color: '#ef4444',
  },
  'selector': {
    color: '#a78bfa', // Light Purple
  },
  'attr-name': {
    color: '#a78bfa', // Light Purple
  },
  'string': {
    color: '#34d399', // Brighter Emerald Green
  },
  'char': {
    color: '#34d399', // Brighter Emerald Green
  },
  'builtin': {
    color: '#a78bfa', // Brighter Violet
  },
  'url': {
    color: '#34d399', // Brighter Emerald Green
  },
  'inserted': {
    color: '#34d399', // Brighter Emerald Green
  },
  'entity': {
    color: '#a78bfa', // Light Purple
    cursor: 'help',
  },
  'atrule': {
    color: '#c084fc', // Light Violet
  },
  'attr-value': {
    color: '#34d399', // Brighter Emerald Green
  },
  'keyword': {
    color: '#c084fc', // Light Violet
  },
  'function': {
    color: '#818cf8', // Indigo
  },
  'class-name': {
    color: '#fbbf24', // Brighter Amber/Orange
  },
  'regex': {
    color: '#06b6d4', // Cyan
  },
  'important': {
    color: '#fbbf24', // Brighter Amber/Orange
    fontWeight: 'bold',
  },
  'variable': {
    color: '#a78bfa', // Light Purple
  },
  'bold': {
    fontWeight: 'bold',
  },
  'italic': {
    fontStyle: 'italic',
  },
  'operator': {
    color: '#d1d5db',
  },
  'script': {
    color: '#f3f4f6',
  },
  'parameter': {
    color: '#fbbf24', // Yellow
  },
  'method': {
    color: '#818cf8', // Indigo
  },
  'field': {
    color: '#fbbf24', // Brighter Amber/Orange
  },
  'annotation': {
    color: '#9ca3af',
  },
  'type': {
    color: '#a78bfa', // Light Purple
  },
  'module': {
    color: '#a78bfa', // Brighter Violet
  },
  // TOML 和其他配置文件的额外支持
  'plain': {
    color: '#f3f4f6', // 确保纯文本为亮白色
  },
  'plain-text': {
    color: '#f3f4f6', // 确保纯文本为亮白色
  },
  'table': {
    color: '#c084fc', // Light Violet - TOML section headers
  },
  'key': {
    color: '#a78bfa', // Light Purple - 配置键名
  },
  'title': {
    color: '#c084fc', // Light Violet
  },
  'section': {
    color: '#c084fc', // Light Violet - INI/TOML sections
  },
};

// 浅色主题
// Light theme
export const claudeSyntaxThemeLight: any = {
  'code[class*="language-"]': {
    color: '#1f2937',
    background: 'transparent',
    textShadow: 'none',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.875em',
    textAlign: 'left',
    whiteSpace: 'pre',
    wordSpacing: 'normal',
    wordBreak: 'normal',
    wordWrap: 'normal',
    lineHeight: '1.5',
    MozTabSize: '4',
    OTabSize: '4',
    tabSize: '4',
    WebkitHyphens: 'none',
    MozHyphens: 'none',
    msHyphens: 'none',
    hyphens: 'none',
  },
  'pre[class*="language-"]': {
    color: '#1f2937',
    background: 'transparent',
    textShadow: 'none',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.875em',
    textAlign: 'left',
    whiteSpace: 'pre',
    wordSpacing: 'normal',
    wordBreak: 'normal',
    wordWrap: 'normal',
    lineHeight: '1.5',
    MozTabSize: '4',
    OTabSize: '4',
    tabSize: '4',
    WebkitHyphens: 'none',
    MozHyphens: 'none',
    msHyphens: 'none',
    hyphens: 'none',
    padding: '1em',
    margin: '0',
    overflow: 'auto',
  },
  ':not(pre) > code[class*="language-"]': {
    background: 'rgba(139, 92, 246, 0.1)',
    padding: '0.1em 0.3em',
    borderRadius: '0.3em',
    whiteSpace: 'normal',
  },
  'comment': {
    color: '#6b7280',
    fontStyle: 'italic',
  },
  'prolog': {
    color: '#6b7280',
  },
  'doctype': {
    color: '#6b7280',
  },
  'cdata': {
    color: '#6b7280',
  },
  'punctuation': {
    color: '#4b5563',
  },
  'namespace': {
    opacity: '0.7',
  },
  'property': {
    color: '#d97706', // Darker Amber/Orange for light theme
  },
  'tag': {
    color: '#7c3aed', // Darker Violet for light theme
  },
  'boolean': {
    color: '#d97706', // Darker Amber/Orange
  },
  'number': {
    color: '#d97706', // Darker Amber/Orange
  },
  'constant': {
    color: '#d97706', // Darker Amber/Orange
  },
  'symbol': {
    color: '#d97706', // Darker Amber/Orange
  },
  'deleted': {
    color: '#dc2626',
  },
  'selector': {
    color: '#8b5cf6', // Purple
  },
  'attr-name': {
    color: '#8b5cf6', // Purple
  },
  'string': {
    color: '#059669', // Darker Emerald Green
  },
  'char': {
    color: '#059669', // Darker Emerald Green
  },
  'builtin': {
    color: '#7c3aed', // Darker Violet
  },
  'url': {
    color: '#059669', // Darker Emerald Green
  },
  'inserted': {
    color: '#059669', // Darker Emerald Green
  },
  'entity': {
    color: '#8b5cf6', // Purple
    cursor: 'help',
  },
  'atrule': {
    color: '#a855f7', // Violet
  },
  'attr-value': {
    color: '#059669', // Darker Emerald Green
  },
  'keyword': {
    color: '#a855f7', // Violet
  },
  'function': {
    color: '#4f46e5', // Darker Indigo
  },
  'class-name': {
    color: '#d97706', // Darker Amber/Orange
  },
  'regex': {
    color: '#0891b2', // Darker Cyan
  },
  'important': {
    color: '#d97706', // Darker Amber/Orange
    fontWeight: 'bold',
  },
  'variable': {
    color: '#8b5cf6', // Purple
  },
  'bold': {
    fontWeight: 'bold',
  },
  'italic': {
    fontStyle: 'italic',
  },
  'operator': {
    color: '#d1d5db',
  },
  'script': {
    color: '#1f2937',
  },
  'parameter': {
    color: '#f59e0b', // Yellow
  },
  'method': {
    color: '#4f46e5', // Darker Indigo
  },
  'field': {
    color: '#d97706', // Darker Amber/Orange
  },
  'annotation': {
    color: '#6b7280',
  },
  'type': {
    color: '#8b5cf6', // Purple
  },
  'module': {
    color: '#7c3aed', // Darker Violet
  },
  // TOML 和其他配置文件的额外支持
  'plain': {
    color: '#1f2937', // 确保纯文本为深灰色
  },
  'plain-text': {
    color: '#1f2937', // 确保纯文本为深灰色
  },
  'table': {
    color: '#a855f7', // Violet - TOML section headers
  },
  'key': {
    color: '#8b5cf6', // Purple - 配置键名
  },
  'title': {
    color: '#a855f7', // Violet
  },
  'section': {
    color: '#a855f7', // Violet - INI/TOML sections
  },
};

// 根据当前主题获取适当主题的函数
// Function to get the appropriate theme based on current theme
export const getClaudeSyntaxTheme = (isDark: boolean = true) => {
  return isDark ? claudeSyntaxTheme : claudeSyntaxThemeLight;
};