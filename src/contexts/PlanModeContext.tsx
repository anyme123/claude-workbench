/**
 * PlanModeContext - Plan 模式状态管理
 *
 * 管理 Plan 模式的状态和审批流程
 * 当 Claude 调用 ExitPlanMode 时触发审批对话框
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";

export interface PendingPlanApproval {
  /** 计划内容 */
  plan: string;
  /** 时间戳 */
  timestamp: number;
}

interface PlanModeContextValue {
  /** 是否处于 Plan 模式 */
  isPlanMode: boolean;
  /** 设置 Plan 模式状态 */
  setIsPlanMode: (value: boolean) => void;
  /** 切换 Plan 模式 */
  togglePlanMode: () => void;

  /** 待审批的计划 */
  pendingApproval: PendingPlanApproval | null;
  /** 是否显示审批对话框 */
  showApprovalDialog: boolean;

  /** 触发计划审批（当检测到 ExitPlanMode 工具调用时） */
  triggerPlanApproval: (plan: string) => void;
  /** 批准计划 - 关闭 Plan 模式 */
  approvePlan: () => void;
  /** 拒绝计划 - 保持 Plan 模式 */
  rejectPlan: () => void;
  /** 关闭审批对话框 */
  closeApprovalDialog: () => void;
}

const PlanModeContext = createContext<PlanModeContextValue | undefined>(
  undefined
);

interface PlanModeProviderProps {
  children: ReactNode;
  /** 初始 Plan 模式状态 */
  initialPlanMode?: boolean;
  /** Plan 模式状态变化回调 */
  onPlanModeChange?: (isPlanMode: boolean) => void;
}

export function PlanModeProvider({
  children,
  initialPlanMode = false,
  onPlanModeChange,
}: PlanModeProviderProps) {
  const [isPlanMode, setIsPlanModeInternal] = useState(initialPlanMode);
  const [pendingApproval, setPendingApproval] =
    useState<PendingPlanApproval | null>(null);
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);

  // 设置 Plan 模式状态（带回调）
  const setIsPlanMode = useCallback(
    (value: boolean) => {
      setIsPlanModeInternal(value);
      onPlanModeChange?.(value);
    },
    [onPlanModeChange]
  );

  // 切换 Plan 模式
  const togglePlanMode = useCallback(() => {
    setIsPlanModeInternal((prev) => {
      const newValue = !prev;
      onPlanModeChange?.(newValue);
      return newValue;
    });
  }, [onPlanModeChange]);

  // 触发计划审批
  const triggerPlanApproval = useCallback((plan: string) => {
    console.log("[PlanMode] Triggering plan approval:", plan.substring(0, 100));
    setPendingApproval({
      plan,
      timestamp: Date.now(),
    });
    setShowApprovalDialog(true);
  }, []);

  // 批准计划 - 关闭 Plan 模式
  const approvePlan = useCallback(() => {
    console.log("[PlanMode] Plan approved, exiting plan mode");
    setIsPlanModeInternal(false);
    onPlanModeChange?.(false);
    setPendingApproval(null);
    setShowApprovalDialog(false);
  }, [onPlanModeChange]);

  // 拒绝计划 - 保持 Plan 模式
  const rejectPlan = useCallback(() => {
    console.log("[PlanMode] Plan rejected, staying in plan mode");
    setPendingApproval(null);
    setShowApprovalDialog(false);
    // 保持 isPlanMode 不变
  }, []);

  // 关闭审批对话框
  const closeApprovalDialog = useCallback(() => {
    setShowApprovalDialog(false);
  }, []);

  const value: PlanModeContextValue = {
    isPlanMode,
    setIsPlanMode,
    togglePlanMode,
    pendingApproval,
    showApprovalDialog,
    triggerPlanApproval,
    approvePlan,
    rejectPlan,
    closeApprovalDialog,
  };

  return (
    <PlanModeContext.Provider value={value}>
      {children}
    </PlanModeContext.Provider>
  );
}

export function usePlanMode() {
  const context = useContext(PlanModeContext);
  if (!context) {
    throw new Error("usePlanMode must be used within PlanModeProvider");
  }
  return context;
}

/**
 * 检测消息中是否包含 ExitPlanMode 工具调用
 * 如果包含，返回计划内容
 */
export function extractExitPlanModeFromMessage(message: any): string | null {
  if (!message) return null;

  // 检查 tool_use 类型的消息
  if (message.type === "tool_use" || message.type === "assistant") {
    const content = message.message?.content || message.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === "tool_use") {
          const toolName = (block.name || "").toLowerCase();
          if (
            toolName === "exitplanmode" ||
            toolName === "exit_plan_mode" ||
            toolName === "exit-plan-mode"
          ) {
            // 提取计划内容
            const input = block.input || {};
            return input.plan || input.content || "";
          }
        }
      }
    }
  }

  return null;
}
