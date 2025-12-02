import { useState, useCallback, useRef } from "react";
import type { CheckResult } from "../lib/updater";
import { checkForUpdate } from "../lib/updater";

interface UseUpdateCheckResult {
  isChecking: boolean;
  error: string | null;
  lastChecked: Date | null;
  checkUpdate: (force?: boolean) => Promise<CheckResult>;
}

export function useUpdateCheck(): UseUpdateCheckResult {
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const isCheckingRef = useRef(false);

  const checkUpdate = useCallback(async (force: boolean = false): Promise<CheckResult> => {
    // 如果正在检查，直接返回错误或等待（此处选择直接返回以避免重复调用）
    if (isCheckingRef.current) {
      return { status: "error", error: "Update check already in progress" };
    }

    // 如果不是强制检查，且距离上次检查不足 5 分钟，则跳过
    if (!force && lastChecked && Date.now() - lastChecked.getTime() < 5 * 60 * 1000) {
      console.log("[useUpdateCheck] Skipping check (recent check < 5 min)");
      return { status: "up-to-date", currentVersion: "" }; // 这里的 currentVersion 可能不准确，但不影响逻辑
    }

    isCheckingRef.current = true;
    setIsChecking(true);
    setError(null);

    try {
      const result = await checkForUpdate({ timeout: 30000 });
      setLastChecked(new Date());

      if (result.status === "error") {
        setError(result.error);
      } else {
        // 如果成功，清除错误
        setError(null);
      }

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error during update check";
      setError(errorMessage);
      return { status: "error", error: errorMessage };
    } finally {
      setIsChecking(false);
      isCheckingRef.current = false;
    }
  }, [lastChecked]);

  return {
    isChecking,
    error,
    lastChecked,
    checkUpdate,
  };
}
