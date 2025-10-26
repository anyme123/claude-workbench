import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import "./assets/shimmer.css";
import "./styles.css";
import "./i18n"; // ✅ i18n 必须同步加载（App 立即需要使用）
import { getCurrentWindow } from '@tauri-apps/api/window';

// ⚡ 优化：只异步加载 toolRegistry（可以延迟）
// import { initializeToolRegistry } from "./lib/toolRegistryInit"; // ❌ 改为异步

// 防止窗口闪烁的React包装组件
const AppWrapper: React.FC = () => {
  React.useEffect(() => {
    // ⚡ 性能优化：异步加载 toolRegistry（可以延迟，不阻塞 UI）
    const initializeToolRegistry = async () => {
      try {
        const { initializeToolRegistry: init } = await import('./lib/toolRegistryInit');
        init();
        console.log('[AppWrapper] ✅ ToolRegistry initialized asynchronously');
      } catch (error) {
        console.error('[AppWrapper] ToolRegistry initialization failed:', error);
      }
    };
    
    // 在React应用完全挂载后显示窗口
    const showWindow = async () => {
      try {
        const window = getCurrentWindow();
        await window.show();
        await window.setFocus();
      } catch (error) {
        console.error('Failed to show window:', error);
      }
    };
    
    // 后台异步初始化 toolRegistry（不阻塞）
    initializeToolRegistry();
    
    // 立即显示窗口（生产模式已优化，不需要长延迟）
    const timer = setTimeout(showWindow, 50);
    return () => clearTimeout(timer);
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </ErrorBoundary>
  );
};

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  // ⚡ PERFORMANCE: 移除 StrictMode 在生产环境（避免双重渲染）
  // StrictMode 在开发时有用，但在生产环境会导致组件渲染两次
  process.env.NODE_ENV === 'development' ? (
    <React.StrictMode>
      <AppWrapper />
    </React.StrictMode>
  ) : (
    <AppWrapper />
  )
);
