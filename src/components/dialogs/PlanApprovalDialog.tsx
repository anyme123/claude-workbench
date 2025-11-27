/**
 * PlanApprovalDialog - 计划审批对话框
 *
 * 当 Claude 调用 ExitPlanMode 工具时显示此对话框
 * 让用户审批计划，确认后关闭 Plan 模式开始执行
 */

import { XCircle, FileText, Play } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface PlanApprovalDialogProps {
  /** 是否显示对话框 */
  open: boolean;
  /** 计划内容 */
  plan: string;
  /** 关闭对话框 */
  onClose: () => void;
  /** 批准计划 - 关闭 Plan 模式开始执行 */
  onApprove: () => void;
  /** 拒绝计划 - 保持 Plan 模式继续规划 */
  onReject: () => void;
}

/**
 * 计划审批对话框
 */
export function PlanApprovalDialog({
  open,
  plan,
  onClose,
  onApprove,
  onReject,
}: PlanApprovalDialogProps) {
  const handleApprove = () => {
    onApprove();
    onClose();
  };

  const handleReject = () => {
    onReject();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center">
              <FileText className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <DialogTitle className="text-lg">计划已完成</DialogTitle>
              <DialogDescription>
                Claude 已完成规划，请审批以下计划
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* 计划内容 */}
        <div className="flex-1 min-h-0 my-4">
          <div className="text-sm font-medium text-muted-foreground mb-2">
            计划内容：
          </div>
          <ScrollArea className="h-[300px] rounded-lg border bg-muted/30 p-4">
            <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">
              {plan || "（无计划内容）"}
            </pre>
          </ScrollArea>
        </div>

        {/* 提示信息 */}
        <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 mb-4">
          <p className="font-medium mb-1">提示：</p>
          <ul className="list-disc list-inside space-y-1">
            <li><strong>批准执行</strong>：关闭 Plan 模式，Claude 将开始执行计划中的操作</li>
            <li><strong>继续规划</strong>：保持 Plan 模式，你可以要求 Claude 修改或完善计划</li>
          </ul>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={handleReject}
            className="gap-2"
          >
            <XCircle className="h-4 w-4" />
            继续规划
          </Button>
          <Button
            onClick={handleApprove}
            className="gap-2 bg-green-600 hover:bg-green-700"
          >
            <Play className="h-4 w-4" />
            批准执行
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
