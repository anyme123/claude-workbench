import { getVersion } from "@tauri-apps/api/app";

// 可选导入：在未注册插件或非 Tauri 环境下，调用时会抛错，外层需做兜底
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import type { Update } from "@tauri-apps/plugin-updater";

export type UpdateChannel = "stable" | "beta";

export interface UpdateInfo {
  currentVersion: string;
  availableVersion: string;
  notes?: string;
  pubDate?: string;
}

export interface UpdateProgressEvent {
  event: "Started" | "Progress" | "Finished";
  total?: number;
  downloaded?: number;
}

export interface UpdateHandle {
  version: string;
  notes?: string;
  date?: string;
  downloadAndInstall: (
    onProgress?: (e: UpdateProgressEvent) => void,
  ) => Promise<void>;
  download?: () => Promise<void>;
  install?: () => Promise<void>;
}

export interface CheckOptions {
  timeout?: number;
  channel?: UpdateChannel;
}

export type CheckResult =
  | { status: "up-to-date"; currentVersion: string }
  | { status: "available"; info: UpdateInfo; update: UpdateHandle }
  | { status: "error"; error: string };

function mapUpdateHandle(raw: Update): UpdateHandle {
  return {
    version: (raw as any).version ?? "",
    notes: (raw as any).notes,
    date: (raw as any).date,
    async downloadAndInstall(onProgress?: (e: UpdateProgressEvent) => void) {
      await (raw as any).downloadAndInstall((evt: any) => {
        if (!onProgress) return;
        const mapped: UpdateProgressEvent = {
          event: evt?.event,
        };
        if (evt?.event === "Started") {
          mapped.total = evt?.data?.contentLength ?? 0;
          mapped.downloaded = 0;
        } else if (evt?.event === "Progress") {
          mapped.downloaded = evt?.data?.chunkLength ?? 0;
        }
        onProgress(mapped);
      });
    },
    download: (raw as any).download
      ? async () => {
          await (raw as any).download();
        }
      : undefined,
    install: (raw as any).install
      ? async () => {
          await (raw as any).install();
        }
      : undefined,
  };
}

export async function getCurrentVersion(): Promise<string> {
  try {
    return await getVersion();
  } catch {
    return "0.0.0";
  }
}

export async function checkForUpdate(
  opts: CheckOptions = {},
): Promise<CheckResult> {
  try {
    // 动态引入，避免在未安装插件时导致打包期问题
    const { check } = await import("@tauri-apps/plugin-updater");

    console.log('[Updater] Checking for updates...');
    const currentVersion = await getCurrentVersion();
    console.log('[Updater] Current version:', currentVersion);

    const update = await check({ timeout: opts.timeout ?? 30000 } as any);
    console.log('[Updater] Check result:', update ? `Update available: ${update.version}` : 'Up to date');

    if (!update) {
      return { status: "up-to-date", currentVersion };
    }

    const mapped = mapUpdateHandle(update);
    const info: UpdateInfo = {
      currentVersion,
      availableVersion: mapped.version,
      notes: mapped.notes,
      pubDate: mapped.date,
    };

    return { status: "available", info, update: mapped };
  } catch (error) {
    console.error('[Updater] Check failed:', error);

    // 提供详细的错误信息
    let errorMessage = '检查更新失败';

    if (error instanceof Error) {
      errorMessage = error.message;

      // 识别常见错误并提供友好提示
      if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
        errorMessage = '更新服务暂不可用（未找到更新信息）';
      } else if (errorMessage.includes('timeout') || errorMessage.includes('network')) {
        errorMessage = '网络连接超时，请检查网络连接';
      } else if (errorMessage.includes('signature') || errorMessage.includes('verify')) {
        errorMessage = '更新签名验证失败';
      } else if (errorMessage.includes('Failed to check for update')) {
         errorMessage = '检查更新服务失败，请稍后重试';
      }
    }

    return { status: "error", error: errorMessage };
  }
}

export async function relaunchApp(): Promise<void> {
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}




