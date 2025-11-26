import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LanguageSelector } from "../LanguageSelector";
import { useTheme } from "@/contexts/ThemeContext";
import { useTranslation } from "@/hooks/useTranslation";
import { api, type ClaudeSettings } from "@/lib/api";

interface GeneralSettingsProps {
  settings: ClaudeSettings | null;
  updateSetting: (key: string, value: any) => void;
  disableRewindGitOps: boolean;
  handleRewindGitOpsToggle: (checked: boolean) => void;
  setToast: (toast: { message: string; type: 'success' | 'error' } | null) => void;
}

export const GeneralSettings: React.FC<GeneralSettingsProps> = ({
  settings,
  updateSetting,
  disableRewindGitOps,
  handleRewindGitOpsToggle,
  setToast
}) => {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  
  // Custom Claude path state
  const [customClaudePath, setCustomClaudePath] = useState<string>("");
  const [isCustomPathMode, setIsCustomPathMode] = useState(false);
  const [customPathError, setCustomPathError] = useState<string | null>(null);

  // Custom Codex path state
  const [customCodexPath, setCustomCodexPath] = useState<string>("");
  const [isCodexCustomPathMode, setIsCodexCustomPathMode] = useState(false);
  const [codexPathError, setCodexPathError] = useState<string | null>(null);
  const [codexPathValid, setCodexPathValid] = useState<boolean | null>(null);
  const [validatingCodexPath, setValidatingCodexPath] = useState(false);

  /**
   * Handle setting custom Claude CLI path
   */
  const handleSetCustomPath = async () => {
    if (!customClaudePath.trim()) {
      setCustomPathError("请输入有效的路径");
      return;
    }

    try {
      setCustomPathError(null);
      await api.setCustomClaudePath(customClaudePath.trim());
      
      // Clear the custom path field and exit custom mode
      setCustomClaudePath("");
      setIsCustomPathMode(false);
      
      // Show success message
      setToast({ message: "自定义 Claude CLI 路径设置成功", type: "success" });
      
      // Trigger status refresh
      window.dispatchEvent(new CustomEvent('validate-claude-installation'));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "设置自定义路径失败";
      setCustomPathError(errorMessage);
    }
  };

  /**
   * Handle clearing custom Claude CLI path
   */
  const handleClearCustomPath = async () => {
    try {
      await api.clearCustomClaudePath();

      // Exit custom mode
      setIsCustomPathMode(false);
      setCustomClaudePath("");
      setCustomPathError(null);

      // Show success message
      setToast({ message: "已恢复到自动检测", type: "success" });

      // Trigger status refresh
      window.dispatchEvent(new CustomEvent('validate-claude-installation'));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "清除自定义路径失败";
      setToast({ message: errorMessage, type: "error" });
    }
  };

  /**
   * Validate Codex path and update status
   */
  const handleValidateCodexPath = async (path: string) => {
    if (!path.trim()) {
      setCodexPathValid(null);
      return;
    }

    setValidatingCodexPath(true);
    try {
      const isValid = await api.validateCodexPath(path.trim());
      setCodexPathValid(isValid);
      if (!isValid) {
        setCodexPathError("路径无效或 Codex 不可执行");
      } else {
        setCodexPathError(null);
      }
    } catch (error) {
      setCodexPathValid(false);
      setCodexPathError("验证路径时出错");
    } finally {
      setValidatingCodexPath(false);
    }
  };

  /**
   * Handle setting custom Codex path
   */
  const handleSetCodexCustomPath = async () => {
    if (!customCodexPath.trim()) {
      setCodexPathError("请输入有效的路径");
      return;
    }

    // First validate the path
    setValidatingCodexPath(true);
    try {
      const isValid = await api.validateCodexPath(customCodexPath.trim());
      if (!isValid) {
        setCodexPathError("路径无效或 Codex 不可执行");
        setCodexPathValid(false);
        return;
      }

      // Path is valid, save it
      await api.setCodexCustomPath(customCodexPath.trim());

      // Update state
      setCodexPathValid(true);
      setCodexPathError(null);
      setIsCodexCustomPathMode(false);
      setCustomCodexPath("");

      // Show success message
      setToast({ message: "自定义 Codex 路径设置成功", type: "success" });

      // Trigger Codex status refresh
      window.dispatchEvent(new CustomEvent('refresh-codex-status'));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "设置自定义路径失败";
      setCodexPathError(errorMessage);
    } finally {
      setValidatingCodexPath(false);
    }
  };

  /**
   * Handle clearing custom Codex path
   */
  const handleClearCodexCustomPath = async () => {
    try {
      await api.setCodexCustomPath(null);

      // Exit custom mode
      setIsCodexCustomPathMode(false);
      setCustomCodexPath("");
      setCodexPathError(null);
      setCodexPathValid(null);

      // Show success message
      setToast({ message: "已恢复 Codex 自动检测", type: "success" });

      // Trigger Codex status refresh
      window.dispatchEvent(new CustomEvent('refresh-codex-status'));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "清除自定义路径失败";
      setToast({ message: errorMessage, type: "error" });
    }
  };

  return (
    <Card className="p-6 space-y-6">
      <div>
        <h3 className="text-base font-semibold mb-4">{t('settings.general')}</h3>
        
        <div className="space-y-4">
          {/* Language Selector */}
          <LanguageSelector />

          {/* Theme Selector */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5 flex-1">
              <Label htmlFor="theme">{t('settings.theme')}</Label>
              <p className="text-xs text-muted-foreground">
                {t('settings.themeDescription')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={theme === 'light' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTheme('light')}
              >
                {t('settings.themeLight')}
              </Button>
              <Button
                variant={theme === 'dark' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTheme('dark')}
              >
                {t('settings.themeDark')}
              </Button>
            </div>
          </div>

          {/* Show System Initialization Info */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5 flex-1">
              <Label htmlFor="showSystemInit">显示系统初始化信息</Label>
              <p className="text-xs text-muted-foreground">
                在会话开始时显示Session ID、Model、工作目录和可用工具信息
              </p>
            </div>
            <Switch
              id="showSystemInit"
              checked={settings?.showSystemInitialization !== false}
              onCheckedChange={(checked) => updateSetting("showSystemInitialization", checked)}
            />
          </div>

          {/* Hide Warmup Messages */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5 flex-1">
              <Label htmlFor="hideWarmup">隐藏 Warmup 消息</Label>
              <p className="text-xs text-muted-foreground">
                在会话消息中隐藏自动发送的 Warmup 消息及其回复（启动时的预热消息）
              </p>
            </div>
            <Switch
              id="hideWarmup"
              checked={settings?.hideWarmupMessages === true}
              onCheckedChange={(checked) => updateSetting("hideWarmupMessages", checked)}
            />
          </div>

          {/* Include Co-authored By */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5 flex-1">
              <Label htmlFor="coauthored">包含 "Co-authored by Claude"</Label>
              <p className="text-xs text-muted-foreground">
                在 git 提交和拉取请求中添加 Claude 署名
              </p>
            </div>
            <Switch
              id="coauthored"
              checked={settings?.includeCoAuthoredBy !== false}
              onCheckedChange={(checked) => updateSetting("includeCoAuthoredBy", checked)}
            />
          </div>
          
          {/* Verbose Output */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5 flex-1">
              <Label htmlFor="verbose">详细输出</Label>
              <p className="text-xs text-muted-foreground">
                显示完整的 bash 和命令输出
              </p>
            </div>
            <Switch
              id="verbose"
              checked={settings?.verbose === true}
              onCheckedChange={(checked) => updateSetting("verbose", checked)}
            />
          </div>

          {/* Disable Rewind Git Operations */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5 flex-1">
              <Label htmlFor="disableRewindGitOps">禁用撤回中的 Git 操作</Label>
              <p className="text-xs text-muted-foreground">
                启用后，撤回功能只能删除对话历史，无法回滚代码变更（适用于多人协作或生产环境）
              </p>
            </div>
            <Switch
              id="disableRewindGitOps"
              checked={disableRewindGitOps}
              onCheckedChange={handleRewindGitOpsToggle}
            />
          </div>
          
          {/* Cleanup Period */}
          <div className="space-y-2">
            <Label htmlFor="cleanup">聊天记录保留天数</Label>
            <Input
              id="cleanup"
              type="number"
              min="1"
              placeholder="30"
              value={settings?.cleanupPeriodDays || ""}
              onChange={(e) => {
                const value = e.target.value ? parseInt(e.target.value) : undefined;
                updateSetting("cleanupPeriodDays", value);
              }}
            />
            <p className="text-xs text-muted-foreground">
              本地保留聊天记录的时长（默认：30天）
            </p>
          </div>
          

          {/* Custom Claude Path Configuration */}
          <div className="space-y-4">
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <Label className="text-sm font-medium">自定义 Claude CLI 路径</Label>
                  <p className="text-xs text-muted-foreground">
                    手动指定自定义的 Claude CLI 可执行文件路径
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsCustomPathMode(!isCustomPathMode);
                    setCustomPathError(null);
                    setCustomClaudePath("");
                  }}
                >
                  {isCustomPathMode ? "取消" : "设置自定义路径"}
                </Button>
              </div>

              <AnimatePresence>
                {isCustomPathMode && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-3"
                  >
                    <div className="space-y-2">
                      <Input
                        placeholder={t('common.pathToClaudeCli')}
                        value={customClaudePath}
                        onChange={(e) => {
                          setCustomClaudePath(e.target.value);
                          setCustomPathError(null);
                        }}
                        className={cn(customPathError && "border-red-500")}
                      />
                      {customPathError && (
                        <p className="text-xs text-red-500">{customPathError}</p>
                      )}
                    </div>
                    
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={handleSetCustomPath}
                        disabled={!customClaudePath.trim()}
                      >
                        设置路径
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleClearCustomPath}
                      >
                        恢复自动检测
                      </Button>
                    </div>
                    
                    <div className="p-3 bg-muted rounded-md">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-xs text-muted-foreground">
                            <strong>当前路径:</strong> 未设置
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            自定义路径在保存前会进行验证。请确保文件存在且为有效的 Claude CLI 可执行文件。
                          </p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Custom Codex Path Configuration */}
          <div className="space-y-4">
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <Label className="text-sm font-medium">自定义 Codex CLI 路径</Label>
                  <p className="text-xs text-muted-foreground">
                    手动指定自定义的 Codex 可执行文件路径（例如：D:\nodejs\node_global\codex.ps1）
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsCodexCustomPathMode(!isCodexCustomPathMode);
                    setCodexPathError(null);
                    setCustomCodexPath("");
                    setCodexPathValid(null);
                  }}
                >
                  {isCodexCustomPathMode ? "取消" : "设置自定义路径"}
                </Button>
              </div>

              <AnimatePresence>
                {isCodexCustomPathMode && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-3"
                  >
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Input
                          placeholder="例如：D:\nodejs\node_global\codex.ps1 或 codex"
                          value={customCodexPath}
                          onChange={(e) => {
                            setCustomCodexPath(e.target.value);
                            setCodexPathError(null);
                            setCodexPathValid(null);
                          }}
                          onBlur={() => {
                            if (customCodexPath.trim()) {
                              handleValidateCodexPath(customCodexPath);
                            }
                          }}
                          className={cn(
                            "flex-1",
                            codexPathError && "border-red-500",
                            codexPathValid === true && "border-green-500"
                          )}
                        />
                        {validatingCodexPath && (
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        )}
                        {!validatingCodexPath && codexPathValid === true && (
                          <span className="text-green-500 text-sm flex items-center">✓ 有效</span>
                        )}
                        {!validatingCodexPath && codexPathValid === false && (
                          <span className="text-red-500 text-sm flex items-center">✗ 无效</span>
                        )}
                      </div>
                      {codexPathError && (
                        <p className="text-xs text-red-500">{codexPathError}</p>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={handleSetCodexCustomPath}
                        disabled={!customCodexPath.trim() || validatingCodexPath}
                      >
                        {validatingCodexPath ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                            验证中...
                          </>
                        ) : (
                          "设置路径"
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleClearCodexCustomPath}
                      >
                        恢复自动检测
                      </Button>
                    </div>

                    <div className="p-3 bg-muted rounded-md">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-xs text-muted-foreground">
                            <strong>提示:</strong> 在 Windows 上，Codex 可能位于 npm/pnpm/yarn 的全局安装目录。
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            常见路径：
                          </p>
                          <ul className="text-xs text-muted-foreground mt-1 ml-3 list-disc">
                            <li>C:\Users\用户名\AppData\Roaming\npm\codex.ps1</li>
                            <li>D:\nodejs\node_global\codex.ps1</li>
                            <li>您的自定义 npm 全局安装目录</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};