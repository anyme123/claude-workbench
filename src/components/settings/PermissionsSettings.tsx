import React from "react";
import { motion } from "framer-motion";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useTranslation } from "@/hooks/useTranslation";

interface PermissionRule {
  id: string;
  value: string;
}

interface PermissionsSettingsProps {
  allowRules: PermissionRule[];
  denyRules: PermissionRule[];
  addPermissionRule: (type: "allow" | "deny") => void;
  updatePermissionRule: (type: "allow" | "deny", id: string, value: string) => void;
  removePermissionRule: (type: "allow" | "deny", id: string) => void;
}

export const PermissionsSettings: React.FC<PermissionsSettingsProps> = ({
  allowRules,
  denyRules,
  addPermissionRule,
  updatePermissionRule,
  removePermissionRule
}) => {
  const { t } = useTranslation();

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div>
          <h3 className="text-base font-semibold mb-2">权限规则</h3>
          <p className="text-sm text-muted-foreground mb-4">
            控制 Claude Code 可以无需手动批准使用的工具
          </p>
        </div>
        
        {/* Allow Rules */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium text-green-500">允许规则</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => addPermissionRule("allow")}
              className="gap-2 hover:border-green-500/50 hover:text-green-500"
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
              添加规则
            </Button>
          </div>
          <div className="space-y-2">
            {allowRules.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                未配置允许规则。Claude 将对所有工具请求您的审批。
              </p>
            ) : (
              allowRules.map((rule) => (
                <motion.div
                  key={rule.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-2"
                >
                  <Input
                    placeholder={t('common.bashExample')}
                    value={rule.value}
                    onChange={(e) => updatePermissionRule("allow", rule.id, e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removePermissionRule("allow", rule.id)}
                    className="h-8 w-8"
                    aria-label="删除规则"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </motion.div>
              ))
            )}
          </div>
        </div>
        
        {/* Deny Rules */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium text-red-500">拒绝规则</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => addPermissionRule("deny")}
              className="gap-2 hover:border-red-500/50 hover:text-red-500"
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
              添加规则
            </Button>
          </div>
          <div className="space-y-2">
            {denyRules.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                未配置拒绝规则。
              </p>
            ) : (
              denyRules.map((rule) => (
                <motion.div
                  key={rule.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-2"
                >
                  <Input
                    placeholder="e.g., Bash(curl:*)"
                    value={rule.value}
                    onChange={(e) => updatePermissionRule("deny", rule.id, e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removePermissionRule("deny", rule.id)}
                    className="h-8 w-8"
                    aria-label="删除规则"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </motion.div>
              ))
            )}
          </div>
        </div>
        
        <div className="pt-2 space-y-2">
          <p className="text-xs text-muted-foreground">
            <strong>示例：</strong>
          </p>
          <ul className="text-xs text-muted-foreground space-y-1 ml-4">
            <li>• <code className="px-1 py-0.5 rounded bg-green-500/10 text-green-600 dark:text-green-400">Bash</code> - 允许所有bash命令</li>
            <li>• <code className="px-1 py-0.5 rounded bg-green-500/10 text-green-600 dark:text-green-400">Bash(npm run build)</code> - 允许精确命令</li>
            <li>• <code className="px-1 py-0.5 rounded bg-green-500/10 text-green-600 dark:text-green-400">Bash(npm run test:*)</code> - 允许带前缀的命令</li>
            <li>• <code className="px-1 py-0.5 rounded bg-green-500/10 text-green-600 dark:text-green-400">Read(~/.zshrc)</code> - 允许读取特定文件</li>
            <li>• <code className="px-1 py-0.5 rounded bg-green-500/10 text-green-600 dark:text-green-400">Edit(docs/**)</code> - 允许编辑docs目录下的文件</li>
          </ul>
        </div>
      </div>
    </Card>
  );
};