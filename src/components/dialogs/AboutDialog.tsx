import { useState, useEffect } from "react";
import { Info, RefreshCw, ExternalLink } from "lucide-react";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { getVersion } from "@tauri-apps/api/app";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
  onCheckUpdate: () => void;
}

export function AboutDialog({ open, onClose, onCheckUpdate }: AboutDialogProps) {
  const [appVersion, setAppVersion] = useState<string>("加载中...");
  const PROJECT_URL = "https://github.com/anyme123/Any-code";

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

  const handleOpenProject = async () => {
    try {
      await openUrl(PROJECT_URL);
    } catch (err) {
      console.error("打开项目地址失败:", err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center sm:text-center">
          <div className="mx-auto mb-4 inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
            <Info className="w-8 h-8 text-primary" />
          </div>
          <DialogTitle className="text-xl">Any Code</DialogTitle>
          <DialogDescription className="flex items-center justify-center gap-2">
            <span>版本:</span>
            <span className="font-mono font-semibold text-primary">
              v{appVersion}
            </span>
          </DialogDescription>
        </DialogHeader>

        {/* Description */}
        <div className="p-4 bg-muted/50 rounded-lg">
          <p className="text-sm text-muted-foreground text-center">
            Any Code 是一个强大的 Claude Code 会话管理工具，
            帮助您更好地组织和管理 Claude 对话。
          </p>
        </div>

        {/* Actions */}
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            variant="secondary"
            onClick={onCheckUpdate}
            className="w-full"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            检查更新
          </Button>

          <Button
            variant="outline"
            onClick={handleOpenProject}
            className="w-full"
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            访问项目地址
          </Button>
        </DialogFooter>

        {/* Footer */}
        <div className="pt-4 border-t border-border text-center">
          <p className="text-xs text-muted-foreground">
            © 2025 Any Code. All rights reserved.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
