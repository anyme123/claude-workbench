import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Play,
  Settings,
  Zap,
  Clock,
  CheckCircle,
  XCircle,
  Save,
  Info,
  Terminal,
  Layers
} from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type {
  HookEvent,
  EnhancedHooksConfiguration,
  HookChainResult,
  HookContext
} from '@/types/enhanced-hooks';
import { convertToEnhanced, convertFromEnhanced } from '@/lib/hooksConverter';

interface EnhancedHooksManagerProps {
  onBack: () => void;
  projectPath?: string;
}


export function EnhancedHooksManager({ onBack, projectPath }: EnhancedHooksManagerProps) {
  const [hooksConfig, setHooksConfig] = useState<EnhancedHooksConfiguration>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [saving, setSaving] = useState(false);
  const [modified, setModified] = useState(false);

  const [testEvent, setTestEvent] = useState<HookEvent | null>(null);
  const [testContext, setTestContext] = useState<HookContext>({
    event: '',
    session_id: 'test-session',
    project_path: projectPath || '/test/project',
    data: {}
  });
  const [testResult, setTestResult] = useState<HookChainResult | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    loadHooksConfig();
  }, [projectPath]);

  const loadHooksConfig = async () => {
    try {
      setLoading(true);
      setError(null);

      const config = projectPath
        ? await api.getMergedHooksConfig(projectPath)
        : await api.getHooksConfig('user');

      // 转换为Enhanced格式
      const enhancedConfig = convertToEnhanced(config);
      setHooksConfig(enhancedConfig);
    } catch (err) {
      console.error('Failed to load hooks config:', err);
      setError(err instanceof Error ? err.message : 'Failed to load hooks configuration');
    } finally {
      setLoading(false);
    }
  };

  const saveHooksConfig = async () => {
    if (!modified) return;

    try {
      setSaving(true);
      setError(null);

      // 转换为原始格式进行保存
      const originalConfig = convertFromEnhanced(hooksConfig);
      const scope = projectPath ? 'local' : 'user';
      await api.updateHooksConfig(scope, originalConfig, projectPath);

      setModified(false);
    } catch (err) {
      console.error('Failed to save hooks config:', err);
      setError(err instanceof Error ? err.message : 'Failed to save hooks configuration');
    } finally {
      setSaving(false);
    }
  };

  const testHookEvent = async () => {
    if (!testEvent) return;

    try {
      setTesting(true);
      setError(null);

      const context: HookContext = {
        ...testContext,
        event: testEvent,
      };

      const result = await api.triggerHookEvent(testEvent, context);
      setTestResult(result);
    } catch (err) {
      console.error('Failed to test hook event:', err);
      setError(err instanceof Error ? err.message : 'Failed to test hook event');
    } finally {
      setTesting(false);
    }
  };

  const renderOverview = () => {
    const stats = {
      totalEvents: Object.keys(hooksConfig).length,
      totalHooks: Object.values(hooksConfig).reduce((sum, hooks) => sum + (hooks?.length || 0), 0),
    };

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-2">
                <Zap className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{stats.totalEvents}</p>
                  <p className="text-xs text-muted-foreground">活跃事件类型</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-2">
                <Layers className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{stats.totalHooks}</p>
                  <p className="text-xs text-muted-foreground">配置的Hooks</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-2">
                <Settings className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{projectPath ? '项目' : '用户'}</p>
                  <p className="text-xs text-muted-foreground">配置作用域</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>快速操作</CardTitle>
            <CardDescription>
              常用的Hooks管理操作
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Button
                variant="outline"
                onClick={() => setActiveTab('testing')}
                className="h-auto p-4 justify-start"
              >
                <Play className="h-4 w-4 mr-3" />
                <div className="text-left">
                  <div className="font-medium">测试Hooks</div>
                  <div className="text-xs text-muted-foreground">测试Hook事件执行</div>
                </div>
              </Button>

              <Button
                variant="outline"
                disabled
                className="h-auto p-4 justify-start opacity-50"
              >
                <Settings className="h-4 w-4 mr-3" />
                <div className="text-left">
                  <div className="font-medium">编辑配置</div>
                  <div className="text-xs text-muted-foreground">功能开发中</div>
                </div>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderTesting = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Play className="h-5 w-5" />
            <span>Hook事件测试</span>
          </CardTitle>
          <CardDescription>
            测试Hook事件的执行效果和链式处理
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>选择事件类型</Label>
              <Select
                value={testEvent || undefined}
                onValueChange={(value) => setTestEvent(value as HookEvent)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择要测试的Hook事件" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PreToolUse">PreToolUse - 工具使用前</SelectItem>
                  <SelectItem value="PostToolUse">PostToolUse - 工具使用后</SelectItem>
                  <SelectItem value="OnContextCompact">OnContextCompact - 上下文压缩</SelectItem>
                  <SelectItem value="OnSessionStart">OnSessionStart - 会话开始</SelectItem>
                  <SelectItem value="OnSessionEnd">OnSessionEnd - 会话结束</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>会话ID</Label>
              <Input
                value={testContext.session_id}
                onChange={(e) => setTestContext({
                  ...testContext,
                  session_id: e.target.value
                })}
                placeholder="测试会话ID"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>项目路径</Label>
            <Input
              value={testContext.project_path}
              onChange={(e) => setTestContext({
                ...testContext,
                project_path: e.target.value
              })}
              placeholder="项目路径"
            />
          </div>

          <Button
            onClick={testHookEvent}
            disabled={!testEvent || testing}
            className="w-full"
          >
            {testing ? (
              <Clock className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            执行测试
          </Button>

          <AnimatePresence>
            {testResult && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-4"
              >
                <div className="border-t my-4" />

                <Card className="border-2 border-primary/20">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Terminal className="h-5 w-5" />
                      <span>执行结果</span>
                      <Badge variant={testResult.should_continue ? "default" : "destructive"}>
                        {testResult.should_continue ? '允许继续' : '阻止操作'}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-2xl font-bold text-green-600">{testResult.successful}</p>
                        <p className="text-xs text-muted-foreground">成功</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-red-600">{testResult.failed}</p>
                        <p className="text-xs text-muted-foreground">失败</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{testResult.total_hooks}</p>
                        <p className="text-xs text-muted-foreground">总计</p>
                      </div>
                    </div>

                    {testResult.results.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">执行详情</Label>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {testResult.results.map((result, index) => (
                            <div
                              key={index}
                              className={`p-3 rounded border text-sm ${
                                result.success
                                  ? 'border-green-200 bg-green-50'
                                  : 'border-red-200 bg-red-50'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-mono text-xs">{result.hook_command}</span>
                                <div className="flex items-center space-x-2">
                                  {result.success ? (
                                    <CheckCircle className="h-4 w-4 text-green-600" />
                                  ) : (
                                    <XCircle className="h-4 w-4 text-red-600" />
                                  )}
                                  <span className="text-xs text-muted-foreground">
                                    {result.execution_time_ms}ms
                                  </span>
                                </div>
                              </div>
                              {result.output && (
                                <pre className="text-xs bg-background p-2 rounded border overflow-x-auto">
                                  {result.output}
                                </pre>
                              )}
                              {result.error && (
                                <p className="text-xs text-red-600 mt-1">{result.error}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Clock className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">正在加载Hooks配置...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="container mx-auto p-6 max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              返回
            </Button>

            {modified && (
              <Button onClick={saveHooksConfig} disabled={saving}>
                {saving ? (
                  <Clock className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                保存配置
              </Button>
            )}
          </div>

          <div>
            <h1 className="text-3xl font-bold tracking-tight">增强型Hooks自动化</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              配置基于事件的智能自动化工作流，支持链式执行和条件触发
            </p>
          </div>
        </motion.div>

        {error && (
          <Alert className="mb-6 border-destructive/50 bg-destructive/10">
            <XCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="overview" className="flex items-center space-x-2">
              <Info className="h-4 w-4" />
              <span>概览</span>
            </TabsTrigger>
            <TabsTrigger value="testing" className="flex items-center space-x-2">
              <Play className="h-4 w-4" />
              <span>测试</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">{renderOverview()}</TabsContent>
          <TabsContent value="testing">{renderTesting()}</TabsContent>
        </Tabs>
      </div>
    </div>
  );
}