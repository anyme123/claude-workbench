import React from "react";
import { Card } from "@/components/ui/card";
import { HooksEditor } from "../HooksEditor";

interface HooksSettingsProps {
  activeTab: string;
  setUserHooksChanged: (changed: boolean) => void;
  getUserHooks: React.MutableRefObject<(() => any) | null>;
}

export const HooksSettings: React.FC<HooksSettingsProps> = ({
  activeTab,
  setUserHooksChanged,
  getUserHooks
}) => {
  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-semibold mb-2">用户钩子</h3>
          <p className="text-sm text-muted-foreground mb-4">
            配置适用于您用户账户的所有 Claude Code 会话的钩子。
            这些设置存储在 <code className="mx-1 px-2 py-1 bg-muted rounded text-xs">~/.claude/settings.json</code> 中
          </p>
        </div>
        
        <HooksEditor
          key={activeTab}
          scope="user"
          className="border-0"
          hideActions={true}
          onChange={(hasChanges, getHooks) => {
            setUserHooksChanged(hasChanges);
            getUserHooks.current = getHooks;
          }}
        />
      </div>
    </Card>
  );
};