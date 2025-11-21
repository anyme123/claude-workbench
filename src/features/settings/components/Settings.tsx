import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Save, 
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  api,
  type ClaudeSettings,
  type ClaudeExecutionConfig
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { Toast, ToastContainer } from "@/components/ui/toast";
import { StorageTab } from "./StorageTab";
import { PromptEnhancementSettings } from "./PromptEnhancementSettings";
import { HooksEditor } from "@/components/HooksEditor";
import { SlashCommandsManager } from "@/components/SlashCommandsManager";
import { LanguageSelector } from "@/components/LanguageSelector";
import { useTranslation } from "@/hooks/useTranslation";
import { useTheme } from "@/contexts/ThemeContext";
import ProviderManager from "./ProviderManager";
import { TranslationSettings } from "./TranslationSettings";

interface SettingsProps {
  /**
   * Callback to go back to the main view
   */
  onBack: () => void;
  /**
   * Optional className for styling
   */
  className?: string;
  /**
   * Optional initial tab to show
   */
  initialTab?: string;
}

interface PermissionRule {
  id: string;
  value: string;
}

interface EnvironmentVariable {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

/**
 * 全面的设置界面，用于管理 Claude Code 设置
 * 提供无代码界面来编辑 settings.json 文件
 * Comprehensive Settings UI for managing Claude Code settings
 * Provides a no-code interface for editing the settings.json file
 */
export const Settings: React.FC<SettingsProps> = ({
  onBack,
  className,
  initialTab = "general",
}) => {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const [settings, setSettings] = useState<ClaudeSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(initialTab);

  // Update active tab if initialTab changes prop
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // ⚡ 监听切换到提示词API标签的事件（内部事件）
  useEffect(() => {
    const handleSwitchTab = () => {
      console.log('[Settings] Switching to prompt-api tab');
      setActiveTab("prompt-api");
    };

    window.addEventListener('switch-to-prompt-api-tab', handleSwitchTab);
    return () => window.removeEventListener('switch-to-prompt-api-tab', handleSwitchTab);
  }, []);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
  // Custom Claude path state
  const [customClaudePath, setCustomClaudePath] = useState<string>("");
  const [isCustomPathMode, setIsCustomPathMode] = useState(false);
  const [customPathError, setCustomPathError] = useState<string | null>(null);
  
  // Permission rules state
  const [allowRules, setAllowRules] = useState<PermissionRule[]>([]);
  const [denyRules, setDenyRules] = useState<PermissionRule[]>([]);
  
  // Environment variables state
  const [envVars, setEnvVars] = useState<EnvironmentVariable[]>([]);
  
  // Execution config state
  const [executionConfig, setExecutionConfig] = useState<ClaudeExecutionConfig | null>(null);
  const [disableRewindGitOps, setDisableRewindGitOps] = useState(false);
  
  // Hooks state
  const [userHooksChanged, setUserHooksChanged] = useState(false);
  const getUserHooks = React.useRef<(() => any) | null>(null);
  
  // 挂载时加载设置
  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);


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
      
      // Reload the current path to reflect changes
      
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
   * Loads the current Claude settings
   */
  const loadSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      const loadedSettings = await api.getClaudeSettings();
      
      // Ensure loadedSettings is an object
      if (!loadedSettings || typeof loadedSettings !== 'object') {
        console.warn("Loaded settings is not an object:", loadedSettings);
        setSettings({});
        return;
      }
      
      setSettings(loadedSettings);

      // Load execution config
      try {
        const execConfig = await api.getClaudeExecutionConfig();
        setExecutionConfig(execConfig);
        setDisableRewindGitOps(execConfig.disable_rewind_git_operations || false);
      } catch (err) {
        console.error("Failed to load execution config:", err);
        // Continue with default values
      }

      // Parse permissions
      if (loadedSettings.permissions && typeof loadedSettings.permissions === 'object') {
        if (Array.isArray(loadedSettings.permissions.allow)) {
          setAllowRules(
            loadedSettings.permissions.allow.map((rule: string, index: number) => ({
              id: `allow-${index}`,
              value: rule,
            }))
          );
        }
        if (Array.isArray(loadedSettings.permissions.deny)) {
          setDenyRules(
            loadedSettings.permissions.deny.map((rule: string, index: number) => ({
              id: `deny-${index}`,
              value: rule,
            }))
          );
        }
      }

      // Parse environment variables
      if (loadedSettings.env && typeof loadedSettings.env === 'object' && !Array.isArray(loadedSettings.env)) {
        setEnvVars(
          Object.entries(loadedSettings.env).map(([key, value], index) => ({
            id: `env-${index}`,
            key,
            value: value as string,
            enabled: true, // 默认启用所有现有的环境变量
          }))
        );
      }

    } catch (err) {
      console.error("Failed to load settings:", err);
      setError("加载设置失败。请确保 ~/.claude 目录存在。");
      setSettings({});
    } finally {
      setLoading(false);
    }
  };

  /**
   * Saves the current settings
   */
  const saveSettings = async () => {
    try {
      setSaving(true);
      setError(null);
      setToast(null);

      // Build the settings object
      const updatedSettings: ClaudeSettings = {
        ...settings,
        permissions: {
          allow: allowRules.map(rule => rule.value).filter(v => v.trim()),
          deny: denyRules.map(rule => rule.value).filter(v => v.trim()),
        },
        env: {
          // 保留现有的所有环境变量（包括代理商配置的ANTHROPIC_*变量）
          ...settings?.env,
          // 然后添加/覆盖UI中配置的环境变量
          ...envVars
            .filter(envVar => envVar.enabled) // 只保存启用的环境变量
            .reduce((acc, { key, value }) => {
              if (key.trim() && value.trim()) {
                acc[key] = value;
              }
              return acc;
            }, {} as Record<string, string>),
        },
      };

      await api.saveClaudeSettings(updatedSettings);
      setSettings(updatedSettings);

      // Save execution config if changed
      if (executionConfig) {
        const updatedExecConfig = {
          ...executionConfig,
          disable_rewind_git_operations: disableRewindGitOps,
        };
        await api.updateClaudeExecutionConfig(updatedExecConfig);
        setExecutionConfig(updatedExecConfig);
      }

      // Save user hooks if changed
      if (userHooksChanged && getUserHooks.current) {
        const hooks = getUserHooks.current();
        await api.updateHooksConfig('user', hooks);
        setUserHooksChanged(false);
      }

      setToast({ message: "Settings saved successfully!", type: "success" });
    } catch (err) {
      console.error("Failed to save settings:", err);
      setError("保存设置失败。");
      setToast({ message: "保存设置失败", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  /**
   * Updates a simple setting value
   */
  const updateSetting = (key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  /**
   * Adds a new permission rule
   */
  const addPermissionRule = (type: "allow" | "deny") => {
    const newRule: PermissionRule = {
      id: `${type}-${Date.now()}`,
      value: "",
    };
    
    if (type === "allow") {
      setAllowRules(prev => [...prev, newRule]);
    } else {
      setDenyRules(prev => [...prev, newRule]);
    }
  };

  /**
   * Updates a permission rule
   */
  const updatePermissionRule = (type: "allow" | "deny", id: string, value: string) => {
    if (type === "allow") {
      setAllowRules(prev => prev.map(rule => 
        rule.id === id ? { ...rule, value } : rule
      ));
    } else {
      setDenyRules(prev => prev.map(rule => 
        rule.id === id ? { ...rule, value } : rule
      ));
    }
  };

  /**
   * Removes a permission rule
   */
  const removePermissionRule = (type: "allow" | "deny", id: string) => {
    if (type === "allow") {
      setAllowRules(prev => prev.filter(rule => rule.id !== id));
    } else {
      setDenyRules(prev => prev.filter(rule => rule.id !== id));
    }
  };

  /**
   * Adds a new environment variable
   */
  const addEnvVar = () => {
    const newVar: EnvironmentVariable = {
      id: `env-${Date.now()}`,
      key: "",
      value: "",
      enabled: true, // 默认启用新的环境变量
    };
    setEnvVars(prev => [...prev, newVar]);
  };

  /**
   * Updates an environment variable
   */
  const updateEnvVar = (id: string, field: "key" | "value" | "enabled", value: string | boolean) => {
    setEnvVars(prev => prev.map(envVar => 
      envVar.id === id ? { ...envVar, [field]: value } : envVar
    ));
  };

  /**
   * Removes an environment variable
   */
  const removeEnvVar = (id: string) => {
    setEnvVars(prev => prev.filter(envVar => envVar.id !== id));
  };

  return (
    <div className={cn("flex flex-col h-full bg-background text-foreground", className)}>
      <div className="max-w-4xl mx-auto w-full flex flex-col h-full">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex items-center justify-between p-4 border-b border-border"
        >
        <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="h-8 w-8"
          aria-label="返回"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <div>
          <h2 className="text-lg font-semibold">{t('settings.title')}</h2>
          <p className="text-xs text-muted-foreground">
              {t('common.configureClaudePreferences')}
          </p>
          </div>
        </div>
        
        <Button
          onClick={saveSettings}
          disabled={saving || loading}
          size="sm"
          className={cn(
            "gap-2 bg-primary hover:bg-primary/90",
            "transition-all duration-200",
            saving && "scale-95 opacity-80"
          )}
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {t('common.savingSettings')}
            </>
          ) : (
            <>
              <Save className="h-4 w-4" aria-hidden="true" />
              {t('common.saveSettings')}
            </>
          )}
        </Button>
      </motion.div>
      
      {/* Error message */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mx-4 mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/50 flex items-center gap-2 text-sm text-destructive"
          >
            <AlertCircle className="h-4 w-4" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid grid-cols-9 w-full">
              <TabsTrigger value="general">{t('settings.general')}</TabsTrigger>
              <TabsTrigger value="permissions">权限</TabsTrigger>
              <TabsTrigger value="environment">环境</TabsTrigger>
              <TabsTrigger value="hooks">钩子</TabsTrigger>
              <TabsTrigger value="commands">命令</TabsTrigger>
              <TabsTrigger value="translation">翻译</TabsTrigger>
              <TabsTrigger value="prompt-api">提示词API</TabsTrigger>
              <TabsTrigger value="provider">代理商</TabsTrigger>
              <TabsTrigger value="storage">{t('settings.storage')}</TabsTrigger>
            </TabsList>
            
            {/* General Settings */}
            <TabsContent value="general" className="space-y-6">
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
                        onCheckedChange={setDisableRewindGitOps}
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
                  </div>
                </div>
              </Card>
            </TabsContent>
            
            {/* Permissions Settings */}
            <TabsContent value="permissions" className="space-y-6">
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
            </TabsContent>
            
            {/* Environment Variables */}
            <TabsContent value="environment" className="space-y-6">
              <Card className="p-6">
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-semibold">环境变量</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        应用于每个 Claude Code 会话的环境变量
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={addEnvVar}
                      className="gap-2"
                    >
                      <Plus className="h-3 w-3" aria-hidden="true" />
                      添加变量
                    </Button>
                  </div>
                  
                  <div className="space-y-3">
                    {envVars.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2">
                        未配置环境变量。
                      </p>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground mb-3">
                          💡 使用开关来启用或禁用环境变量。只有启用的变量会被应用到 Claude Code 会话中。
                        </p>
                        {envVars.map((envVar) => (
                          <motion.div
                            key={envVar.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex items-center gap-2"
                          >
                            {/* 启用/禁用开关 */}
                            <div className="flex items-center">
                              <Switch
                                checked={envVar.enabled}
                                onCheckedChange={(checked) => updateEnvVar(envVar.id, "enabled", checked)}
                                title={envVar.enabled ? "禁用环境变量" : "启用环境变量"}
                                className="scale-75"
                              />
                            </div>
                            
                            <Input
                              placeholder="KEY"
                              value={envVar.key}
                              onChange={(e) => updateEnvVar(envVar.id, "key", e.target.value)}
                              className={`flex-1 font-mono text-sm ${!envVar.enabled ? 'opacity-50' : ''}`}
                              disabled={!envVar.enabled}
                            />
                            <span className={`text-muted-foreground ${!envVar.enabled ? 'opacity-50' : ''}`}>=</span>
                            <Input
                              placeholder="value"
                              value={envVar.value}
                              onChange={(e) => updateEnvVar(envVar.id, "value", e.target.value)}
                              className={`flex-1 font-mono text-sm ${!envVar.enabled ? 'opacity-50' : ''}`}
                              disabled={!envVar.enabled}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeEnvVar(envVar.id)}
                              className="h-8 w-8 hover:text-destructive"
                              aria-label="删除环境变量"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </motion.div>
                        ))}
                      </>
                    )}
                  </div>
                  
                  <div className="pt-2 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      <strong>常用变量:</strong>
                    </p>
                    <ul className="text-xs text-muted-foreground space-y-1 ml-4">
                      <li>• <code className="px-1 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">CLAUDE_CODE_ENABLE_TELEMETRY</code> - 启用/禁用遥测 (0 或 1)</li>
                      <li>• <code className="px-1 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">ANTHROPIC_MODEL</code> - 自定义模型名称</li>
                      <li>• <code className="px-1 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">DISABLE_COST_WARNINGS</code> - 禁用费用警告 (1)</li>
                    </ul>
                  </div>
                </div>
              </Card>
            </TabsContent>
            
            {/* Hooks Settings */}
            <TabsContent value="hooks" className="space-y-6">
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
            </TabsContent>
            
            {/* Commands Tab */}
            <TabsContent value="commands">
              <Card className="p-6">
                <SlashCommandsManager className="p-0" />
              </Card>
            </TabsContent>
            
            {/* Translation Tab */}
            <TabsContent value="translation">
              <TranslationSettings />
            </TabsContent>
            
            {/* Prompt Enhancement API Tab */}
            <TabsContent value="prompt-api">
              <PromptEnhancementSettings />
            </TabsContent>
            
            {/* Provider Tab */}
            <TabsContent value="provider">
              <ProviderManager onBack={() => {}} />
            </TabsContent>
            
            {/* Storage Tab */}
            <TabsContent value="storage">
              <StorageTab />
            </TabsContent>
            
          </Tabs>
        </div>
      )}
      </div>
      
      {/* Toast Notification */}
      <ToastContainer>
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onDismiss={() => setToast(null)}
          />
        )}
      </ToastContainer>
    </div>
  );
}; 
