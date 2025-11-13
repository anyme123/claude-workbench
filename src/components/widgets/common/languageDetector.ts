/**
 * ✅ Language Detector - 根据文件扩展名检测编程语言
 *
 * 提取自 ToolWidgets.tsx，供代码高亮组件复用
 */

/**
 * 根据文件路径获取对应的编程语言
 *
 * @param path 文件路径
 * @returns 语言标识符（用于语法高亮）
 */
export const getLanguage = (path: string): string => {
  const ext = path.split('.').pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    py: "python",
    rs: "rust",
    go: "go",
    java: "java",
    cpp: "cpp",
    c: "c",
    cs: "csharp",
    php: "php",
    rb: "ruby",
    swift: "swift",
    kt: "kotlin",
    scala: "scala",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    fish: "bash",
    yml: "yaml",
    yaml: "yaml",
    json: "json",
    xml: "xml",
    html: "html",
    css: "css",
    scss: "scss",
    sass: "sass",
    less: "less",
    md: "markdown",
    sql: "sql",
    graphql: "graphql",
    vue: "vue",
    svelte: "svelte",
  };

  return languageMap[ext || ''] || 'text';
};
