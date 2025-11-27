import { useState, useEffect } from "react";
import { Download, RefreshCw, AlertCircle, ExternalLink } from "lucide-react";
import { useUpdate } from "@/contexts/UpdateContext";
import { relaunchApp } from "@/lib/updater";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { statusStyles } from "@/lib/messageUtils";

interface UpdateDialogProps {
  open: boolean;
  onClose: () => void;
}

export function UpdateDialog({ open, onClose }: UpdateDialogProps) {
  const { updateInfo, updateHandle, dismissUpdate } = useUpdate();
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isPortable, setIsPortable] = useState(false);

  // 检测是否为免安装版本
  useEffect(() => {
    const checkPortable = async () => {
      try {
        const portable = !updateHandle;
        setIsPortable(portable);
      } catch {
        setIsPortable(true);
      }
    };

    if (open) {
      checkPortable();
    }
  }, [open, updateHandle]);

  if (!updateInfo) {
    return null;
  }

  const handleOpenDownloadPage = async () => {
    try {
      const releaseUrl = `https://github.com/anyme123/Any-code/releases/tag/v${updateInfo.availableVersion}`;
      await openUrl(releaseUrl);
      handleDismissAndClose();
    } catch (err) {
      console.error("打开下载页面失败:", err);
      setError("无法打开下载页面，请手动访问 GitHub Releases");
    }
  };

  const handleDownloadAndInstall = async () => {
    if (!updateHandle) {
      setError("自动更新不可用，请使用手动下载");
      return;
    }

    setIsDownloading(true);
    setError(null);
    setDownloadProgress(0);

    try {
      let totalBytes = 0;
      let downloadedBytes = 0;

      await updateHandle.downloadAndInstall((event) => {
        if (event.event === "Started") {
          totalBytes = event.total || 0;
          downloadedBytes = 0;
        } else if (event.event === "Progress") {
          downloadedBytes += event.downloaded || 0;
          if (totalBytes > 0) {
            setDownloadProgress(Math.round((downloadedBytes / totalBytes) * 100));
          }
        } else if (event.event === "Finished") {
          setDownloadProgress(100);
          setIsInstalled(true);
        }
      });
    } catch (err) {
      console.error("下载安装失败:", err);
      setError(err instanceof Error ? err.message : "下载安装失败，请尝试手动下载");
      setIsPortable(true);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleRestart = async () => {
    try {
      await relaunchApp();
    } catch (err) {
      console.error("重启失败:", err);
      setError("重启失败，请手动重启应用");
    }
  };

  const handleDismissAndClose = () => {
    dismissUpdate();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Download className="w-5 h-5 text-primary" />
            <DialogTitle>发现新版本</DialogTitle>
          </div>
          <DialogDescription>
            <div className="flex flex-col gap-1 mt-2">
              <div className="flex items-baseline gap-2">
                <span>当前版本:</span>
                <span className="font-mono">v{updateInfo.currentVersion}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span>最新版本:</span>
                <span className="font-mono font-semibold text-primary">
                  v{updateInfo.availableVersion}
                </span>
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>

        {/* Portable Version Notice */}
        {isPortable && (
          <div className={cn("p-3 rounded-lg", statusStyles.info)}>
            <p className="text-sm">
              ℹ️ 检测到您使用的是免安装版本，不支持自动更新。请点击下方按钮前往下载页面手动下载最新版本。
            </p>
          </div>
        )}

        {/* Release Notes */}
        {updateInfo.notes && (
          <div>
            <h3 className="text-sm font-medium text-foreground mb-2">
              更新内容：
            </h3>
            <div className="bg-muted rounded-lg p-3 max-h-48 overflow-y-auto">
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans">
                {updateInfo.notes}
              </pre>
            </div>
          </div>
        )}

        {/* Progress */}
        {isDownloading && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">下载中...</span>
              <span className="text-sm font-medium text-primary">
                {downloadProgress}%
              </span>
            </div>
            <Progress value={downloadProgress} />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className={cn("p-3 rounded-lg flex items-start gap-2", statusStyles.error)}>
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Success */}
        {isInstalled && (
          <div className={cn("p-3 rounded-lg", statusStyles.success)}>
            <p className="text-sm">
              ✓ 更新已安装，请重启应用以使用新版本
            </p>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={handleDismissAndClose}
            disabled={isDownloading}
          >
            稍后提醒
          </Button>

          {isPortable ? (
            <Button onClick={handleOpenDownloadPage}>
              <ExternalLink className="w-4 h-4 mr-2" />
              前往下载
            </Button>
          ) : isInstalled ? (
            <Button onClick={handleRestart}>
              <RefreshCw className="w-4 h-4 mr-2" />
              立即重启
            </Button>
          ) : (
            <Button onClick={handleDownloadAndInstall} disabled={isDownloading}>
              {isDownloading ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  下载中...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  立即更新
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
