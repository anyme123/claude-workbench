/**
 * PlanModeContext - Plan 模式状态管理
 *
 * 管理 Plan 模式的状态和审批流程
 * 当 Claude 调用 ExitPlanMode 时触发审批对话框
 *
 * 改进功能：
 * - 追踪已审批的计划，避免重复弹窗
 * - 批准后自动发送提示词
 * - 显示已审批状态
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
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
  /** 拒绝计划 - 保持 Plan 模式 */
  rejectPlan: () => void;
  /** 关闭审批对话框 */
  closeApprovalDialog: () => void;

  /** 检查计划是否已审批 */
  isPlanApproved: (planId: string) => boolean;
  /** 已审批的计划 ID 集合 */
  approvedPlanIds: Set<string>;

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
 * 从 sessionStorage 加载已审批的计划 ID
 */
function loadApprovedPlanIds(): Set<string> {
  try {
    const stored = sessionStorage.getItem('approved_plan_ids');
    if (stored) {
      return new Set(JSON.parse(stored));
    }
  } catch (e) {
    console.error('[PlanMode] Failed to load approved plan IDs:', e);
  }
  return new Set();
}

/**
 * 保存已审批的计划 ID 到 sessionStorage
 */
function saveApprovedPlanIds(ids: Set<string>) {
  try {
    sessionStorage.setItem('approved_plan_ids', JSON.stringify([...ids]));
  } catch (e) {
    console.error('[PlanMode] Failed to save approved plan IDs:', e);
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
  const [approvedPlanIds, setApprovedPlanIds] = useState<Set<string>>(loadApprovedPlanIds);

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

  // 检查计划是否已审批
  const isPlanApproved = useCallback((planId: string) => {
    return approvedPlanIds.has(planId);
  }, [approvedPlanIds]);

  // 触发计划审批
  const triggerPlanApproval = useCallback((plan: string) => {
    const planId = generatePlanId(plan);

    // 如果已审批，不再弹窗
    if (approvedPlanIds.has(planId)) {
      console.log("[PlanMode] Plan already approved, skipping dialog:", planId);
      return;
    }

    console.log("[PlanMode] Triggering plan approval:", planId, plan.substring(0, 100));
    setPendingApproval({
      plan,
      planId,
      timestamp: Date.now(),
    });
    setShowApprovalDialog(true);
  }, [approvedPlanIds]);

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
      saveApprovedPlanIds(newSet);
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

  // 清理过期的已审批计划（可选：超过 24 小时）
  useEffect(() => {
    // 这里可以添加清理逻辑，但 sessionStorage 会在浏览器关闭时自动清理
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
    isPlanApproved,
    approvedPlanIds,
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
