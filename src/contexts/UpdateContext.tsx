import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import type { UpdateInfo, UpdateHandle } from "../lib/updater";
import { useUpdateCheck } from "../hooks/useUpdateCheck";

interface UpdateContextValue {
  // 更新状态
  hasUpdate: boolean;
  updateInfo: UpdateInfo | null;
  updateHandle: UpdateHandle | null;
  isChecking: boolean;
  error: string | null;
  lastChecked: Date | null;

  // 提示状态
  isDismissed: boolean;
  dismissUpdate: () => void;

  // 操作方法
  checkUpdate: (force?: boolean) => Promise<boolean>;
  resetDismiss: () => void;
}

const UpdateContext = createContext<UpdateContextValue | undefined>(undefined);

export function UpdateProvider({ children }: { children: React.ReactNode }) {
  const DISMISSED_VERSION_KEY = "claudeworkbench:update:dismissedVersion";
  const LEGACY_DISMISSED_KEY = "dismissedUpdateVersion"; // 兼容旧键

  // 使用自定义 Hook 处理检查逻辑
  const { isChecking, error, lastChecked, checkUpdate: performCheck } = useUpdateCheck();

  const [hasUpdate, setHasUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateHandle, setUpdateHandle] = useState<UpdateHandle | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);

  // 从 localStorage 读取已关闭的版本
  useEffect(() => {
    const current = updateInfo?.availableVersion;
    if (!current) return;

    // 读取新键；若不存在，尝试迁移旧键
    let dismissedVersion = localStorage.getItem(DISMISSED_VERSION_KEY);
    if (!dismissedVersion) {
      const legacy = localStorage.getItem(LEGACY_DISMISSED_KEY);
      if (legacy) {
        localStorage.setItem(DISMISSED_VERSION_KEY, legacy);
        localStorage.removeItem(LEGACY_DISMISSED_KEY);
        dismissedVersion = legacy;
      }
    }

    setIsDismissed(dismissedVersion === current);
  }, [updateInfo?.availableVersion]);

  const checkUpdate = useCallback(async (force: boolean = false) => {
    const result = await performCheck(force);

    if (result.status === "available") {
      setHasUpdate(true);
      setUpdateInfo(result.info);
      setUpdateHandle(result.update);

      // 检查是否已经关闭过这个版本的提醒
      let dismissedVersion = localStorage.getItem(DISMISSED_VERSION_KEY);
      if (!dismissedVersion) {
        const legacy = localStorage.getItem(LEGACY_DISMISSED_KEY);
        if (legacy) {
          localStorage.setItem(DISMISSED_VERSION_KEY, legacy);
          localStorage.removeItem(LEGACY_DISMISSED_KEY);
          dismissedVersion = legacy;
        }
      }
      // 仅在非强制检查时考虑 isDismissed；如果是用户手动强制检查，即使之前 dismiss 过也应该显示
      const isDismissedVersion = dismissedVersion === result.info.availableVersion;
      if (force) {
        setIsDismissed(false); // 强制检查时重置忽略状态
      } else {
        setIsDismissed(isDismissedVersion);
      }
      
      return true; // 有更新
    } else {
      // up-to-date or error
      if (result.status === "up-to-date" || result.status === "error") {
         // 如果检查结果是没有更新或出错，清除之前的更新状态
         // 注意：如果是 error，可能不应该清除旧的可用更新信息？
         // 这里选择清除，因为我们无法确定之前的更新是否仍然有效
         setHasUpdate(false);
         setUpdateInfo(null);
         setUpdateHandle(null);
         setIsDismissed(false);
      }
      return false;
    }
  }, [performCheck]);

  const dismissUpdate = useCallback(() => {
    setIsDismissed(true);
    if (updateInfo?.availableVersion) {
      localStorage.setItem(DISMISSED_VERSION_KEY, updateInfo.availableVersion);
      // 清理旧键
      localStorage.removeItem(LEGACY_DISMISSED_KEY);
    }
  }, [updateInfo?.availableVersion]);

  const resetDismiss = useCallback(() => {
    setIsDismissed(false);
    localStorage.removeItem(DISMISSED_VERSION_KEY);
    localStorage.removeItem(LEGACY_DISMISSED_KEY);
  }, []);

  // 应用启动时自动检查更新
  useEffect(() => {
    // 延迟2秒后检查，避免影响启动体验
    const timer = setTimeout(() => {
      checkUpdate(false).catch(console.error);
    }, 2000);

    return () => clearTimeout(timer);
  }, [checkUpdate]);

  const value: UpdateContextValue = {
    hasUpdate,
    updateInfo,
    updateHandle,
    isChecking,
    error,
    lastChecked,
    isDismissed,
    dismissUpdate,
    checkUpdate,
    resetDismiss,
  };

  return (
    <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>
  );
}

export function useUpdate() {
  const context = useContext(UpdateContext);
  if (!context) {
    throw new Error("useUpdate must be used within UpdateProvider");
  }
  return context;
}




