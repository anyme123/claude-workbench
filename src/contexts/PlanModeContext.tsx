/**
 * PlanModeContext - Plan 模式状态管理
 *
 * 管理 Plan 模式的状态和审批流程
 * 当 Claude 调用 ExitPlanMode 时触发审批对话框
 *
 * 改进功能：
 * - 追踪已审批/已拒绝的计划，避免重复弹窗
 * - 批准后自动发送提示词开始执行
 * - 拒绝后自动发送提示词继续规划
 * - 显示已审批/已拒绝状态
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";

export interface PendingPlanApproval {
  /** 计划内容 */
  plan: string;
  /** 计划 ID（用于追踪） */
  planId: string;
  /** 时间戳 */
  timestamp: number;
}

/** 计划状态类型 */
export type PlanStatus = 'pending' | 'approved' | 'rejected';

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
  /** 批准计划 - 关闭 Plan 模式并自动发送提示词 */
  approvePlan: () => void;
  /** 拒绝计划 - 保持 Plan 模式并自动发送提示词继续规划 */
  rejectPlan: () => void;
  /** 关闭审批对话框 */
  closeApprovalDialog: () => void;

  /** 获取计划状态 */
  getPlanStatus: (planId: string) => PlanStatus;
  /** 检查计划是否已审批 */
  isPlanApproved: (planId: string) => boolean;
  /** 检查计划是否已拒绝 */
  isPlanRejected: (planId: string) => boolean;
  /** 已审批的计划 ID 集合 */
  approvedPlanIds: Set<string>;
  /** 已拒绝的计划 ID 集合 */
  rejectedPlanIds: Set<string>;

  /** 设置发送提示词的回调（由 ClaudeCodeSession 设置） */
  setSendPromptCallback: (callback: ((prompt: string) => void) | null) => void;
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

/**
 * 生成计划的唯一 ID（基于内容的简单 hash）
 */
function generatePlanId(plan: string): string {
  // 使用内容前 200 字符 + 长度作为简单标识
  const content = plan.substring(0, 200);
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `plan_${Math.abs(hash)}_${plan.length}`;
}

/**
 * 从 sessionStorage 加载计划 ID 集合
 */
function loadPlanIds(key: string): Set<string> {
  try {
    const stored = sessionStorage.getItem(key);
    if (stored) {
      return new Set(JSON.parse(stored));
    }
  } catch (e) {
    console.error(`[PlanMode] Failed to load ${key}:`, e);
  }
  return new Set();
}

/**
 * 保存计划 ID 集合到 sessionStorage
 */
function savePlanIds(key: string, ids: Set<string>) {
  try {
    sessionStorage.setItem(key, JSON.stringify([...ids]));
  } catch (e) {
    console.error(`[PlanMode] Failed to save ${key}:`, e);
  }
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
  const [approvedPlanIds, setApprovedPlanIds] = useState<Set<string>>(
    () => loadPlanIds('approved_plan_ids')
  );
  const [rejectedPlanIds, setRejectedPlanIds] = useState<Set<string>>(
    () => loadPlanIds('rejected_plan_ids')
  );

  // 发送提示词的回调引用
  const sendPromptCallbackRef = useRef<((prompt: string) => void) | null>(null);

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

  // 获取计划状态
  const getPlanStatus = useCallback((planId: string): PlanStatus => {
    if (approvedPlanIds.has(planId)) return 'approved';
    if (rejectedPlanIds.has(planId)) return 'rejected';
    return 'pending';
  }, [approvedPlanIds, rejectedPlanIds]);

  // 检查计划是否已审批
  const isPlanApproved = useCallback((planId: string) => {
    return approvedPlanIds.has(planId);
  }, [approvedPlanIds]);

  // 检查计划是否已拒绝
  const isPlanRejected = useCallback((planId: string) => {
    return rejectedPlanIds.has(planId);
  }, [rejectedPlanIds]);

  // 触发计划审批
  const triggerPlanApproval = useCallback((plan: string) => {
    const planId = generatePlanId(plan);

    // 如果已审批或已拒绝，不再弹窗
    if (approvedPlanIds.has(planId)) {
      console.log("[PlanMode] Plan already approved, skipping dialog:", planId);
      return;
    }
    if (rejectedPlanIds.has(planId)) {
      console.log("[PlanMode] Plan already rejected, skipping dialog:", planId);
      return;
    }

    console.log("[PlanMode] Triggering plan approval:", planId, plan.substring(0, 100));
    setPendingApproval({
      plan,
      planId,
      timestamp: Date.now(),
    });
    setShowApprovalDialog(true);
  }, [approvedPlanIds, rejectedPlanIds]);

  // 设置发送提示词回调
  const setSendPromptCallback = useCallback((callback: ((prompt: string) => void) | null) => {
    sendPromptCallbackRef.current = callback;
  }, []);

  // 批准计划 - 关闭 Plan 模式并自动发送提示词
  const approvePlan = useCallback(() => {
    if (!pendingApproval) return;

    const { planId } = pendingApproval;
    console.log("[PlanMode] Plan approved:", planId);

    // 标记为已审批
    setApprovedPlanIds(prev => {
      const newSet = new Set(prev);
      newSet.add(planId);
      savePlanIds('approved_plan_ids', newSet);
      return newSet;
    });

    // 关闭 Plan 模式
    setIsPlanModeInternal(false);
    onPlanModeChange?.(false);

    // 关闭对话框
    setPendingApproval(null);
    setShowApprovalDialog(false);

    // 自动发送提示词，让 Claude 开始执行
    if (sendPromptCallbackRef.current) {
      console.log("[PlanMode] Auto-sending execution prompt");
      // 延迟发送，确保状态已更新
      setTimeout(() => {
        sendPromptCallbackRef.current?.("请开始执行上述计划。");
      }, 100);
    }
  }, [pendingApproval, onPlanModeChange]);

  // 拒绝计划 - 保持 Plan 模式，让用户自行输入修改意见
  const rejectPlan = useCallback(() => {
    if (!pendingApproval) return;

    const { planId } = pendingApproval;
    console.log("[PlanMode] Plan rejected, continuing planning:", planId);

    // 标记为已拒绝
    setRejectedPlanIds(prev => {
      const newSet = new Set(prev);
      newSet.add(planId);
      savePlanIds('rejected_plan_ids', newSet);
      return newSet;
    });

    // 关闭对话框，保持 Plan 模式不变
    // 用户可以自行输入修改意见
    setPendingApproval(null);
    setShowApprovalDialog(false);
  }, [pendingApproval]);

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
    getPlanStatus,
    isPlanApproved,
    isPlanRejected,
    approvedPlanIds,
    rejectedPlanIds,
    setSendPromptCallback,
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
 * 生成计划 ID 的公共方法（供 Widget 使用）
 */
export function getPlanId(plan: string): string {
  return generatePlanId(plan);
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
