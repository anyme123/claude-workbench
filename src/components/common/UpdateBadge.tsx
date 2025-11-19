import { X, Download } from "lucide-react";
import { useUpdate } from "@/contexts/UpdateContext";

interface UpdateBadgeProps {
  className?: string;
  onClick?: () => void;
}

export function UpdateBadge({ className = "", onClick }: UpdateBadgeProps) {
  const { hasUpdate, updateInfo, isDismissed, dismissUpdate } = useUpdate();

  // 如果没有更新或已关闭，不显示
  if (!hasUpdate || isDismissed || !updateInfo) {
    return null;
  }

  return (
    <div
      className={`
        flex items-center gap-1.5 px-2.5 py-1
        bg-card border border-primary/30
        rounded-lg text-xs
        shadow-sm
        transition-all duration-200
        ${onClick ? "cursor-pointer hover:bg-accent" : ""}
        ${className}
      `}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : -1}
      onClick={onClick}
      onKeyDown={(e) => {
        if (!onClick) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      title="有新版本可用"
    >
      <Download className="w-3 h-3 text-primary" />
      <span className="text-foreground font-medium">
        v{updateInfo.availableVersion}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          dismissUpdate();
        }}
        className="
          ml-1 -mr-0.5 p-0.5 rounded
          hover:bg-muted
          transition-colors
          focus:outline-none focus:ring-2 focus:ring-primary/20
        "
        aria-label="关闭更新提醒"
        title="关闭更新提醒"
      >
        <X className="w-3 h-3 text-muted-foreground" />
      </button>
    </div>
  );
}



