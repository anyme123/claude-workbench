import { useState, useEffect } from "react";
import { X, Info, RefreshCw, ExternalLink } from "lucide-react";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { getVersion } from "@tauri-apps/api/app";

interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
  onCheckUpdate: () => void;
}

export function AboutDialog({ open, onClose, onCheckUpdate }: AboutDialogProps) {
  const [appVersion, setAppVersion] = useState<string>("加载中...");
  const PROJECT_URL = "https://github.com/anyme123/claude-workbench";

  // 动态获取应用版本号
  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const version = await getVersion();
        setAppVersion(version);
      } catch (err) {
        console.error("获取版本号失败:", err);
        setAppVersion("未知");
      }
    };

    if (open) {
      fetchVersion();
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const handleOpenProject = async () => {
    try {
      await openUrl(PROJECT_URL);
    } catch (err) {
      console.error("打开项目地址失败:", err);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-lg shadow-2xl max-w-md w-full mx-4 overflow-hidden border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Info className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">
              关于 Claude Workbench
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-muted transition-colors"
            aria-label="关闭"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Version Info */}
          <div className="mb-6 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <Info className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-xl font-bold text-foreground mb-2">
              Claude Workbench
            </h3>
            <div className="flex items-center justify-center gap-2">
              <span className="text-sm text-muted-foreground">版本:</span>
              <span className="text-base font-mono font-semibold text-primary">
                v{appVersion}
              </span>
            </div>
          </div>

          {/* Description */}
          <div className="mb-6 p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground text-center">
              Claude Workbench 是一个强大的 Claude AI 会话管理工具，
              帮助您更好地组织和管理 Claude 对话。
            </p>
          </div>

          {/* Actions */}
          <div className="space-y-2">
            <button
              onClick={onCheckUpdate}
              className="w-full px-4 py-2.5 text-sm font-medium text-foreground bg-muted hover:bg-muted/80 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              检查更新
            </button>

            <button
              onClick={handleOpenProject}
              className="w-full px-4 py-2.5 text-sm font-medium text-primary hover:text-primary/80 border border-border hover:border-primary/30 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              访问项目地址
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-muted/50 border-t border-border text-center">
          <p className="text-xs text-muted-foreground">
            © 2025 Claude Workbench. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
