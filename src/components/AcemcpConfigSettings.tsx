import { useState, useEffect } from "react";
import { Database, Save, RefreshCw, Eye, EyeOff, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface AcemcpConfigSettingsProps {
  className?: string;
}

interface AcemcpConfig {
  baseUrl: string;
  token: string;
  batchSize?: number;
  maxLinesPerBlob?: number;
}

export function AcemcpConfigSettings({ className }: AcemcpConfigSettingsProps) {
  const [config, setConfig] = useState<AcemcpConfig>({
    baseUrl: '',
    token: '',
    batchSize: 10,
    maxLinesPerBlob: 800,
  });

  const [showToken, setShowToken] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');

  // 加载配置
  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setIsLoading(true);
    try {
      const loaded = await api.loadAcemcpConfig();
      setConfig(loaded);
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to load acemcp config:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.saveAcemcpConfig(
        config.baseUrl,
        config.token,
        config.batchSize,
        config.maxLinesPerBlob
      );
      setHasChanges(false);
      setTestStatus('idle');
    } catch (error) {
      console.error('Failed to save acemcp config:', error);
      alert('保存失败: ' + (error instanceof Error ? error.message : '未知错误'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setConfig({
      baseUrl: '',
      token: '',
      batchSize: 10,
      maxLinesPerBlob: 800,
    });
    setHasChanges(true);
  };

  const handleTest = async () => {
    if (!config.baseUrl || !config.token) {
      setTestStatus('error');
      setTestMessage('请先配置 BASE_URL 和 TOKEN');
      return;
    }

    setTestStatus('testing');
    setTestMessage('正在测试...');

    try {
      const available = await api.testAcemcpAvailability();
      if (available) {
        setTestStatus('success');
        setTestMessage('Acemcp 可用！');
      } else {
        setTestStatus('error');
        setTestMessage('Acemcp 不可用，请检查配置');
      }
    } catch (error) {
      setTestStatus('error');
      setTestMessage(error instanceof Error ? error.message : '测试失败');
    }
  };

  const handleChange = (field: keyof AcemcpConfig, value: any) => {
    setConfig({ ...config, [field]: value });
    setHasChanges(true);
    setTestStatus('idle');
  };

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Database className="h-5 w-5" />
            Acemcp 项目上下文搜索配置
          </h3>
          <p className="text-sm text-muted-foreground">
            配置 acemcp 语义搜索引擎的 API 端点和认证信息
          </p>
        </div>
        <div className="flex gap-2">
          {hasChanges && (
            <Badge variant="outline" className="text-orange-600 border-orange-600">
              未保存
            </Badge>
          )}
          <Button onClick={handleReset} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            重置
          </Button>
          <Button onClick={handleSave} size="sm" disabled={!hasChanges || isSaving}>
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? '保存中...' : '保存配置'}
          </Button>
        </div>
      </div>

      <Card className="p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-muted-foreground">加载配置中...</div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* API Base URL */}
            <div>
              <Label htmlFor="acemcp-base-url">API Base URL *</Label>
              <Input
                id="acemcp-base-url"
                value={config.baseUrl}
                onChange={(e) => handleChange('baseUrl', e.target.value)}
                placeholder="https://api.example.com"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Acemcp 语义搜索 API 的端点地址
              </p>
            </div>

            {/* API Token */}
            <div>
              <Label htmlFor="acemcp-token">API Token *</Label>
              <div className="relative">
                <Input
                  id="acemcp-token"
                  type={showToken ? "text" : "password"}
                  value={config.token}
                  onChange={(e) => handleChange('token', e.target.value)}
                  placeholder="your-api-token-here"
                  className="font-mono pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                API 认证令牌
              </p>
            </div>

            {/* 高级配置 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="acemcp-batch-size">批量上传大小</Label>
                <Input
                  id="acemcp-batch-size"
                  type="number"
                  min="1"
                  max="50"
                  value={config.batchSize || 10}
                  onChange={(e) => handleChange('batchSize', parseInt(e.target.value) || 10)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  默认: 10
                </p>
              </div>

              <div>
                <Label htmlFor="acemcp-max-lines">单文件最大行数</Label>
                <Input
                  id="acemcp-max-lines"
                  type="number"
                  min="100"
                  max="5000"
                  value={config.maxLinesPerBlob || 800}
                  onChange={(e) => handleChange('maxLinesPerBlob', parseInt(e.target.value) || 800)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  默认: 800
                </p>
              </div>
            </div>

            {/* 测试连接 */}
            <div className="pt-2">
              <Button
                onClick={handleTest}
                variant="outline"
                size="sm"
                disabled={testStatus === 'testing' || !config.baseUrl || !config.token}
              >
                {testStatus === 'testing' ? (
                  <>
                    <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    测试中...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    测试连接
                  </>
                )}
              </Button>

              {testStatus === 'success' && (
                <Badge variant="outline" className="ml-2 text-green-600 border-green-600">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  {testMessage}
                </Badge>
              )}

              {testStatus === 'error' && (
                <Badge variant="outline" className="ml-2 text-red-600 border-red-600">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  {testMessage}
                </Badge>
              )}
            </div>

            {/* 说明 */}
            <Card className="p-3 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
              <p className="text-sm text-blue-900 dark:text-blue-100">
                💡 配置保存到 <code className="px-1 py-0.5 bg-blue-100 dark:bg-blue-900 rounded text-xs">~/.acemcp/settings.toml</code>
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                启用 "项目上下文" 开关后，优化提示词时会自动调用 acemcp 搜索相关代码
              </p>
            </Card>
          </div>
        )}
      </Card>
    </div>
  );
}
