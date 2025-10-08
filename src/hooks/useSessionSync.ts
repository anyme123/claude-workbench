import { useEffect } from 'react';
import { useTabs } from './useTabs';
import { api } from '@/lib/api';

/**
 * useSessionSync - 会话状态同步Hook
 *
 * 🔧 NEW: 定期同步标签页状态与ProcessRegistry中的实际运行会话
 *
 * 功能：
 * - 每5秒检查一次运行中的Claude会话
 * - 检测标签页streamingStatus与实际运行状态的不一致
 * - 自动修正不一致的状态
 * - 网络错误时降级处理，不影响用户体验
 */
export const useSessionSync = () => {
  const { tabs, updateTabStreamingStatus } = useTabs();

  useEffect(() => {
    // 定期同步会话状态（5秒间隔）
    const syncInterval = setInterval(async () => {
      try {
        // 获取实际运行的Claude会话列表
        const runningSessions = await api.listRunningClaudeSessions();
        const runningSessionIds = new Set(
          runningSessions
            .map((s: any) => s.session_id)
            .filter((id: string) => id) // 过滤undefined
        );

        // 遍历所有标签页，检查状态一致性
        tabs.forEach(tab => {
          if (tab.session?.id) {
            const isActuallyRunning = runningSessionIds.has(tab.session.id);
            const tabThinkRunning = tab.state === 'streaming';

            // 状态不一致，修正
            if (isActuallyRunning && !tabThinkRunning) {
              console.warn(
                `[SessionSync] Tab ${tab.id} session ${tab.session.id} is running but tab state shows not streaming - correcting`
              );
              updateTabStreamingStatus(tab.id, true, tab.session.id);
            } else if (!isActuallyRunning && tabThinkRunning) {
              console.warn(
                `[SessionSync] Tab ${tab.id} session ${tab.session.id} stopped but tab state shows streaming - correcting`
              );
              updateTabStreamingStatus(tab.id, false, null);
            }
          }
        });
      } catch (error) {
        // 网络错误或API调用失败，降级处理
        console.error('[SessionSync] Failed to sync sessions:', error);
        // 不中断用户操作，静默失败
      }
    }, 5000); // 5秒间隔

    // 清理定时器
    return () => clearInterval(syncInterval);
  }, [tabs, updateTabStreamingStatus]);
};
