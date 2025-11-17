/**
 * AutoCompactSettings - Configuration UI for automatic context compaction
 *
 * This component provides a comprehensive interface for configuring Claude Code SDK's
 * auto-compact functionality with intelligent threshold management and real-time monitoring.
 */

import React, { useState, useEffect } from 'react';
import {
  Settings2,
  Zap,
  Clock,
  BarChart3,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Save,
  Loader2,
  Info,
  Activity,
  Brain,
  Gauge,
  Timer,
  MessageSquare,
  TrendingUp,
  Sparkles,
  Shield
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { api, AutoCompactConfig, AutoCompactStatus, SessionContext, CompactionStrategy } from '@/lib/api';

interface AutoCompactSettingsProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

export const AutoCompactSettings: React.FC<AutoCompactSettingsProps> = ({
  open,
  onOpenChange,
  className,
}) => {
  const [config, setConfig] = useState<AutoCompactConfig | null>(null);
  const [status, setStatus] = useState<AutoCompactStatus | null>(null);
  const [sessions, setSessions] = useState<SessionContext[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState("config");

  // Load initial data
  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open]);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Initialize auto-compact manager if not already done
      try {
        await api.initAutoCompactManager();
      } catch (e) {
        // Manager might already be initialized, ignore error
        console.debug("Auto-compact manager might already be initialized");
      }

      // Load configuration and status
      const [configData, statusData, sessionsData] = await Promise.all([
        api.getAutoCompactConfig(),
        api.getAutoCompactStatus(),
        api.getAllMonitoredSessions(),
      ]);

      setConfig(configData);
      setStatus(statusData);
      setSessions(sessionsData);
    } catch (err) {
      console.error("Failed to load auto-compact data:", err);
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfigChange = (updates: Partial<AutoCompactConfig>) => {
    if (!config) return;

    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!config) return;

    setIsSaving(true);
    setError(null);

    try {
      await api.updateAutoCompactConfig(config);
      setHasChanges(false);

      // Reload data to show updated values
      await loadData();
    } catch (err) {
      console.error("Failed to save config:", err);
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleManualCompaction = async (sessionId: string) => {
    try {
      await api.triggerManualCompaction(sessionId);
      // Reload sessions to show updated status
      await loadData();
    } catch (err) {
      console.error("Failed to trigger compaction:", err);
      setError(err instanceof Error ? err.message : "Failed to trigger compaction");
    }
  };

  const getStrategyIcon = (strategy: CompactionStrategy) => {
    if (strategy === 'Smart') return <Brain className="h-4 w-4" />;
    if (strategy === 'Aggressive') return <Zap className="h-4 w-4" />;
    if (strategy === 'Conservative') return <Shield className="h-4 w-4" />;
    return <Settings2 className="h-4 w-4" />;
  };

  const getStrategyDescription = (strategy: CompactionStrategy) => {
    if (strategy === 'Smart') return "智能压缩，保留关键信息和决策";
    if (strategy === 'Aggressive') return "激进压缩，仅保留最关键的内容";
    if (strategy === 'Conservative') return "保守压缩，保持更多上下文";
    return "自定义压缩策略";
  };

  const getSessionStatusIcon = (status: SessionContext['status']) => {
    if (status === 'Active') return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    if (status === 'Compacting') return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />;
    if (status === 'Idle') return <Clock className="h-4 w-4 text-yellow-500" />;
    return <XCircle className="h-4 w-4 text-red-500" />;
  };

  const getSessionStatusText = (status: SessionContext['status']) => {
    if (status === 'Active') return "活跃";
    if (status === 'Compacting') return "压缩中";
    if (status === 'Idle') return "空闲";
    if (typeof status === 'object' && 'CompactionFailed' in status) {
      return `压缩失败: ${status.CompactionFailed}`;
    }
    return "未知";
  };

  const formatTokenCount = (count: number) => {
    if (count < 1000) return count.toString();
    if (count < 1000000) return `${(count / 1000).toFixed(1)}K`;
    return `${(count / 1000000).toFixed(1)}M`;
  };

  if (isLoading || !config) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <span className="ml-3 text-muted-foreground">加载自动压缩设置...</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-w-4xl max-h-[85vh] overflow-hidden", className)}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-blue-500" />
            自动上下文管理
          </DialogTitle>
          <DialogDescription>
            配置 Claude Code SDK 的智能上下文窗口管理和自动压缩功能
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <span className="text-red-700 text-sm">{error}</span>
            </div>
          </div>
        )}

        <Tabs value={activeTab} className="flex-1 overflow-hidden"
              onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="config" className="flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              配置
            </TabsTrigger>
            <TabsTrigger value="status" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              状态监控
            </TabsTrigger>
            <TabsTrigger value="sessions" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              会话管理
            </TabsTrigger>
          </TabsList>

          <TabsContent value="config" className="space-y-6 overflow-auto max-h-[calc(85vh-200px)]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  基本设置
                </CardTitle>
                <CardDescription>
                  启用和配置自动压缩功能的核心参数
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">启用自动压缩</Label>
                    <p className="text-sm text-muted-foreground">
                      自动监控上下文长度并在需要时触发压缩
                    </p>
                  </div>
                  <Switch
                    checked={config.enabled}
                    onCheckedChange={(enabled) => handleConfigChange({ enabled })}
                  />
                </div>

                <hr className="border-t border-border my-4" />

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Gauge className="h-4 w-4 text-blue-500" />
                    <Label className="text-base">最大上下文 Tokens</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="h-4 w-4 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Claude 4 默认支持 200K tokens，建议设置为 120K 以确保性能</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    type="number"
                    value={config.max_context_tokens}
                    onChange={(e) => handleConfigChange({
                      max_context_tokens: parseInt(e.target.value) || 120000
                    })}
                    min={10000}
                    max={200000}
                    step={1000}
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-orange-500" />
                    <Label className="text-base">压缩阈值</Label>
                    <Badge variant="secondary">{Math.round(config.compaction_threshold * 100)}%</Badge>
                  </div>
                  <div className="px-2">
                    <input
                      type="range"
                      value={config.compaction_threshold}
                      onChange={(e) => handleConfigChange({ compaction_threshold: parseFloat(e.target.value) })}
                      max={1.0}
                      min={0.5}
                      step={0.05}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>50%</span>
                      <span>保守</span>
                      <span>激进</span>
                      <span>100%</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Timer className="h-4 w-4 text-green-500" />
                    <Label className="text-base">压缩间隔 (秒)</Label>
                  </div>
                  <Input
                    type="number"
                    value={config.min_compaction_interval}
                    onChange={(e) => handleConfigChange({
                      min_compaction_interval: parseInt(e.target.value) || 300
                    })}
                    min={60}
                    max={3600}
                    step={60}
                  />
                  <p className="text-xs text-muted-foreground">
                    两次压缩之间的最小时间间隔，防止频繁压缩影响性能
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="h-4 w-4" />
                  压缩策略
                </CardTitle>
                <CardDescription>
                  选择适合您使用场景的压缩策略
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <Label className="text-base">策略类型</Label>
                  <Select
                    value={typeof config.compaction_strategy === 'string' ? config.compaction_strategy : 'Custom'}
                    onValueChange={(value) => {
                      if (value === 'Custom') {
                        handleConfigChange({ compaction_strategy: { Custom: config.custom_instructions || "" } });
                      } else {
                        handleConfigChange({
                          compaction_strategy: value as 'Smart' | 'Aggressive' | 'Conservative'
                        });
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue>
                        <div className="flex items-center gap-2">
                          {getStrategyIcon(config.compaction_strategy)}
                          {typeof config.compaction_strategy === 'string' ? config.compaction_strategy : 'Custom'}
                        </div>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Smart">
                        <div className="flex items-center gap-2">
                          <Brain className="h-4 w-4" />
                          <div>
                            <p className="font-medium">智能压缩</p>
                            <p className="text-xs text-muted-foreground">平衡性能和完整性</p>
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="Aggressive">
                        <div className="flex items-center gap-2">
                          <Zap className="h-4 w-4" />
                          <div>
                            <p className="font-medium">激进压缩</p>
                            <p className="text-xs text-muted-foreground">最大程度减少 tokens</p>
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="Conservative">
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4" />
                          <div>
                            <p className="font-medium">保守压缩</p>
                            <p className="text-xs text-muted-foreground">保持更多上下文</p>
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="Custom">
                        <div className="flex items-center gap-2">
                          <Settings2 className="h-4 w-4" />
                          <div>
                            <p className="font-medium">自定义</p>
                            <p className="text-xs text-muted-foreground">使用自定义指令</p>
                          </div>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    {getStrategyDescription(config.compaction_strategy)}
                  </p>
                </div>

                {(typeof config.compaction_strategy === 'object' || config.custom_instructions) && (
                  <div className="space-y-3">
                    <Label className="text-base">自定义压缩指令</Label>
                    <Textarea
                      value={config.custom_instructions || ""}
                      onChange={(e) => handleConfigChange({ custom_instructions: e.target.value })}
                      placeholder="输入自定义的压缩指令，指导 Claude 如何处理上下文..."
                      className="min-h-[100px]"
                    />
                    <p className="text-xs text-muted-foreground">
                      这些指令将与基础策略结合使用，提供更精确的压缩控制
                    </p>
                  </div>
                )}

                <hr className="border-t border-border my-4" />

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-base">保留最近消息</Label>
                      <p className="text-sm text-muted-foreground">
                        确保最新的交互内容不被压缩
                      </p>
                    </div>
                    <Switch
                      checked={config.preserve_recent_messages}
                      onCheckedChange={(preserve_recent_messages) =>
                        handleConfigChange({ preserve_recent_messages })}
                    />
                  </div>

                  {config.preserve_recent_messages && (
                    <div className="space-y-2">
                      <Label>保留消息数量</Label>
                      <Input
                        type="number"
                        value={config.preserve_message_count}
                        onChange={(e) => handleConfigChange({
                          preserve_message_count: parseInt(e.target.value) || 10
                        })}
                        min={1}
                        max={50}
                      />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => loadData()}
                disabled={isLoading}
              >
                <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
                刷新
              </Button>
              <Button
                onClick={handleSave}
                disabled={!hasChanges || isSaving}
                className={cn(
                  "bg-blue-600 hover:bg-blue-700",
                  "transition-all duration-200",
                  isSaving && "scale-95 opacity-80"
                )}
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="h-4 w-4 mr-2" aria-hidden="true" />
                )}
                {isSaving ? "保存中..." : "保存设置"}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="status" className="space-y-4 overflow-auto max-h-[calc(85vh-200px)]">
            {status && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    系统状态
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-muted-foreground">状态</p>
                      <div className="flex items-center gap-2">
                        {status.enabled ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                        <span className="text-sm">
                          {status.enabled ? "启用" : "禁用"}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <p className="text-sm font-medium text-muted-foreground">监控中的会话</p>
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-blue-500" />
                        <span className="text-sm">{status.sessions_count}</span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <p className="text-sm font-medium text-muted-foreground">总压缩次数</p>
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-orange-500" />
                        <span className="text-sm">{status.total_compactions}</span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <p className="text-sm font-medium text-muted-foreground">压缩阈值</p>
                      <div className="flex items-center gap-2">
                        <Gauge className="h-4 w-4 text-purple-500" />
                        <span className="text-sm">
                          {formatTokenCount(Math.round(status.max_context_tokens * status.compaction_threshold))}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="sessions" className="space-y-4 overflow-auto max-h-[calc(85vh-200px)]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    活跃会话
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadData}
                    disabled={isLoading}
                  >
                    <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                  </Button>
                </CardTitle>
                <CardDescription>
                  监控所有注册的 Claude 会话的上下文状态
                </CardDescription>
              </CardHeader>
              <CardContent>
                {sessions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <MessageSquare className="h-8 w-8 mx-auto mb-3 opacity-50" />
                    <p>暂无活跃会话</p>
                    <p className="text-sm">启动 Claude Code 会话后将在此显示</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sessions.map((session) => (
                      <div
                        key={session.session_id}
                        className="border rounded-lg p-4 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {getSessionStatusIcon(session.status)}
                            <div>
                              <p className="font-medium text-sm">
                                {session.session_id.slice(0, 8)}...
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {session.model}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">
                              {getSessionStatusText(session.status)}
                            </Badge>
                            {session.status === 'Active' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleManualCompaction(session.session_id)}
                              >
                                <Zap className="h-3 w-3 mr-1" />
                                压缩
                              </Button>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          <div>
                            <p className="text-muted-foreground">当前 Tokens</p>
                            <p className="font-medium">
                              {formatTokenCount(session.current_tokens)}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">消息数量</p>
                            <p className="font-medium">{session.message_count}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">压缩次数</p>
                            <p className="font-medium">{session.compaction_count}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">项目路径</p>
                            <p className="font-medium text-xs truncate">
                              ...{session.project_path.slice(-20)}
                            </p>
                          </div>
                        </div>

                        {session.current_tokens > 0 && config && (
                          <div className="space-y-2">
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>使用情况</span>
                              <span>
                                {Math.round((session.current_tokens / config.max_context_tokens) * 100)}%
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className={cn(
                                  "h-2 rounded-full transition-all duration-300",
                                  session.current_tokens / config.max_context_tokens > config.compaction_threshold
                                    ? "bg-red-500"
                                    : session.current_tokens / config.max_context_tokens > 0.7
                                    ? "bg-yellow-500"
                                    : "bg-green-500"
                                )}
                                style={{
                                  width: `${Math.min(
                                    (session.current_tokens / config.max_context_tokens) * 100,
                                    100
                                  )}%`,
                                }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default AutoCompactSettings;