import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Settings2,
  Globe,
  Check,
  AlertCircle,
  RefreshCw,
  Trash2,
  TestTube,
  Eye,
  EyeOff,
  Plus,
  Edit,
  Trash,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { api, type GeminiProviderConfig, type CurrentGeminiProviderConfig } from '@/lib/api';
import { Toast } from '@/components/ui/toast';
import GeminiProviderForm from './GeminiProviderForm';
import {
  geminiProviderPresets,
  extractApiKeyFromEnv,
  extractBaseUrlFromEnv,
  extractModelFromEnv,
  getCategoryDisplayName,
} from '@/config/geminiProviderPresets';

interface GeminiProviderManagerProps {
  onBack?: () => void;
}

export default function GeminiProviderManager({ onBack }: GeminiProviderManagerProps) {
  const [presets, setPresets] = useState<GeminiProviderConfig[]>([]);
  const [currentConfig, setCurrentConfig] = useState<CurrentGeminiProviderConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showCurrentConfig, setShowCurrentConfig] = useState(false);
  const [showTokens, setShowTokens] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingProvider, setEditingProvider] = useState<GeminiProviderConfig | null>(null);
  const [toastMessage, setToastMessage] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Delete confirmation dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [providerToDelete, setProviderToDelete] = useState<GeminiProviderConfig | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      // 尝试加载自定义预设和当前配置
      let customPresets: GeminiProviderConfig[] = [];
      let config: CurrentGeminiProviderConfig | null = null;

      try {
        customPresets = await api.getGeminiProviderPresets();
      } catch (error) {
        console.warn('Failed to load custom Gemini presets, using defaults:', error);
      }

      try {
        config = await api.getCurrentGeminiProviderConfig();
      } catch (error) {
        console.warn('Failed to load current Gemini config:', error);
      }

      // 合并内置预设和自定义预设
      const builtInPresets: GeminiProviderConfig[] = geminiProviderPresets
        .filter(p => !p.isCustomTemplate) // 排除自定义模板
        .map(p => ({
          id: p.id,
          name: p.name,
          description: p.description,
          websiteUrl: p.websiteUrl,
          category: p.category,
          env: p.env,
          isOfficial: p.category === 'official',
          isPartner: p.isPartner,
        }));

      // 自定义预设放在内置预设后面
      setPresets([...builtInPresets, ...customPresets]);
      setCurrentConfig(config);
    } catch (error) {
      console.error('Failed to load Gemini provider data:', error);
      setToastMessage({ message: '加载 Gemini 代理商配置失败', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const switchProvider = async (config: GeminiProviderConfig) => {
    try {
      setSwitching(config.id);
      const message = await api.switchGeminiProvider(config);
      setToastMessage({ message, type: 'success' });
      await loadData();
    } catch (error) {
      console.error('Failed to switch Gemini provider:', error);
      setToastMessage({ message: '切换 Gemini 代理商失败', type: 'error' });
    } finally {
      setSwitching(null);
    }
  };

  const clearProvider = async () => {
    try {
      setSwitching('clear');
      const message = await api.clearGeminiProviderConfig();
      setToastMessage({ message, type: 'success' });
      await loadData();
    } catch (error) {
      console.error('Failed to clear Gemini provider:', error);
      setToastMessage({ message: '清理 Gemini 配置失败', type: 'error' });
    } finally {
      setSwitching(null);
    }
  };

  const testConnection = async (config: GeminiProviderConfig) => {
    try {
      setTesting(config.id);
      const baseUrl = extractBaseUrlFromEnv(config.env);
      const apiKey = extractApiKeyFromEnv(config.env);
      const message = await api.testGeminiProviderConnection(baseUrl, apiKey);
      setToastMessage({ message, type: 'success' });
    } catch (error) {
      console.error('Failed to test Gemini connection:', error);
      setToastMessage({ message: '连接测试失败', type: 'error' });
    } finally {
      setTesting(null);
    }
  };

  const handleAddProvider = () => {
    setEditingProvider(null);
    setShowForm(true);
  };

  const handleEditProvider = (config: GeminiProviderConfig) => {
    setEditingProvider(config);
    setShowForm(true);
  };

  const handleDeleteProvider = (config: GeminiProviderConfig) => {
    setProviderToDelete(config);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteProvider = async () => {
    if (!providerToDelete) return;

    try {
      setDeleting(providerToDelete.id);
      await api.deleteGeminiProviderConfig(providerToDelete.id);
      setToastMessage({ message: 'Gemini 代理商删除成功', type: 'success' });
      await loadData();
      setDeleteDialogOpen(false);
      setProviderToDelete(null);
    } catch (error) {
      console.error('Failed to delete Gemini provider:', error);
      setToastMessage({ message: '删除 Gemini 代理商失败', type: 'error' });
    } finally {
      setDeleting(null);
    }
  };

  const cancelDeleteProvider = () => {
    setDeleteDialogOpen(false);
    setProviderToDelete(null);
  };

  const handleFormSubmit = async (formData: Omit<GeminiProviderConfig, 'id'>) => {
    try {
      if (editingProvider) {
        const updatedConfig = { ...formData, id: editingProvider.id };
        await api.updateGeminiProviderConfig(updatedConfig);

        // 如果编辑的是当前活跃的代理商，同步更新配置文件
        if (isCurrentProvider(editingProvider)) {
          try {
            await api.switchGeminiProvider(updatedConfig);
            setToastMessage({ message: 'Gemini 代理商更新成功，配置文件已同步更新', type: 'success' });
          } catch (switchError) {
            console.error('Failed to sync Gemini provider config:', switchError);
            setToastMessage({ message: 'Gemini 代理商更新成功，但配置文件同步失败', type: 'error' });
          }
        } else {
          setToastMessage({ message: 'Gemini 代理商更新成功', type: 'success' });
        }
      } else {
        await api.addGeminiProviderConfig(formData);
        setToastMessage({ message: 'Gemini 代理商添加成功', type: 'success' });
      }
      setShowForm(false);
      setEditingProvider(null);
      await loadData();
    } catch (error) {
      console.error('Failed to save Gemini provider:', error);
      setToastMessage({ message: editingProvider ? '更新 Gemini 代理商失败' : '添加 Gemini 代理商失败', type: 'error' });
    }
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setEditingProvider(null);
  };

  // 判断是否为当前使用的供应商
  const isCurrentProvider = (config: GeminiProviderConfig): boolean => {
    if (!currentConfig) return false;

    // 官方供应商：检查 selectedAuthType 是否为 oauth-personal 且没有 baseUrl
    if (config.isOfficial || config.category === 'official') {
      return currentConfig.selectedAuthType === 'oauth-personal' && !currentConfig.baseUrl;
    }

    // 第三方供应商：通过 baseUrl 判断
    const configBaseUrl = extractBaseUrlFromEnv(config.env);
    const currentBaseUrl = currentConfig.baseUrl || '';
    return configBaseUrl === currentBaseUrl && !!configBaseUrl;
  };

  // 判断是否为内置预设（不能删除）
  const isBuiltInPreset = (config: GeminiProviderConfig): boolean => {
    return geminiProviderPresets.some(p => p.id === config.id);
  };

  const maskToken = (token: string): string => {
    if (!token || token.length <= 10) return token;
    const start = token.substring(0, 8);
    const end = token.substring(token.length - 4);
    return `${start}${'*'.repeat(Math.min(token.length - 12, 20))}${end}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">正在加载 Gemini 代理商配置...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          {onBack && (
            <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8" aria-label="返回设置">
              <Settings2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Gemini 代理商管理
            </h1>
            <p className="text-xs text-muted-foreground">
              一键切换不同的 Gemini API 代理商
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={handleAddProvider}
            className="text-xs"
          >
            <Plus className="h-3 w-3 mr-1" aria-hidden="true" />
            添加代理商
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCurrentConfig(true)}
            className="text-xs"
          >
            <Eye className="h-3 w-3 mr-1" aria-hidden="true" />
            查看当前配置
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={clearProvider}
            disabled={switching === 'clear'}
            className="text-xs"
          >
            {switching === 'clear' ? (
              <RefreshCw className="h-3 w-3 mr-1 animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 className="h-3 w-3 mr-1" aria-hidden="true" />
            )}
            重置为官方
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          {presets.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <Globe className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-sm text-muted-foreground mb-4">还没有配置任何 Gemini 代理商</p>
                <Button onClick={handleAddProvider} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  添加第一个代理商
                </Button>
              </div>
            </div>
          ) : (
            presets.map((config) => (
              <Card key={config.id} className={`p-4 ${isCurrentProvider(config) ? 'ring-2 ring-primary' : ''}`}>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-muted-foreground" />
                        <h3 className="font-medium">{config.name}</h3>
                      </div>
                      {isCurrentProvider(config) && (
                        <Badge variant="secondary" className="text-xs">
                          <Check className="h-3 w-3 mr-1" />
                          当前使用
                        </Badge>
                      )}
                      {config.isOfficial && (
                        <Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-950">
                          官方
                        </Badge>
                      )}
                      {config.isPartner && (
                        <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-950">
                          合作
                        </Badge>
                      )}
                      {config.category && (
                        <Badge variant="outline" className="text-xs">
                          {getCategoryDisplayName(config.category)}
                        </Badge>
                      )}
                    </div>

                    <div className="space-y-1 text-sm text-muted-foreground">
                      {config.description && (
                        <p><span className="font-medium">描述：</span>{config.description}</p>
                      )}
                      {config.websiteUrl && (
                        <p className="flex items-center gap-1">
                          <span className="font-medium">官网：</span>
                          <a
                            href={config.websiteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline flex items-center gap-1"
                          >
                            {config.websiteUrl}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </p>
                      )}
                      {!config.isOfficial && (
                        <>
                          {extractApiKeyFromEnv(config.env) && (
                            <p><span className="font-medium">API Key：</span>
                              {showTokens ? extractApiKeyFromEnv(config.env) : maskToken(extractApiKeyFromEnv(config.env))}
                            </p>
                          )}
                          {extractBaseUrlFromEnv(config.env) && (
                            <p><span className="font-medium">API地址：</span>{extractBaseUrlFromEnv(config.env)}</p>
                          )}
                          {extractModelFromEnv(config.env) && (
                            <p><span className="font-medium">模型：</span>{extractModelFromEnv(config.env)}</p>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!config.isOfficial && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => testConnection(config)}
                        disabled={testing === config.id}
                        className="text-xs"
                        aria-label="测试连接"
                      >
                        {testing === config.id ? (
                          <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" />
                        ) : (
                          <TestTube className="h-3 w-3" aria-hidden="true" />
                        )}
                      </Button>
                    )}

                    {!isBuiltInPreset(config) && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditProvider(config)}
                          className="text-xs"
                          aria-label="编辑代理商"
                        >
                          <Edit className="h-3 w-3" aria-hidden="true" />
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteProvider(config)}
                          disabled={deleting === config.id}
                          className="text-xs text-red-600 hover:text-red-700"
                          aria-label="删除代理商"
                        >
                          {deleting === config.id ? (
                            <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" />
                          ) : (
                            <Trash className="h-3 w-3" aria-hidden="true" />
                          )}
                        </Button>
                      </>
                    )}

                    <Button
                      size="sm"
                      onClick={() => switchProvider(config)}
                      disabled={switching === config.id || isCurrentProvider(config)}
                      className="text-xs"
                    >
                      {switching === config.id ? (
                        <RefreshCw className="h-3 w-3 mr-1 animate-spin" aria-hidden="true" />
                      ) : (
                        <Check className="h-3 w-3 mr-1" aria-hidden="true" />
                      )}
                      {isCurrentProvider(config) ? '已选择' : '切换到此配置'}
                    </Button>
                  </div>
                </div>
              </Card>
            ))
          )}

          {/* Toggle tokens visibility */}
          {presets.length > 0 && (
            <div className="flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowTokens(!showTokens)}
                className="text-xs"
              >
                {showTokens ? (
                  <EyeOff className="h-3 w-3 mr-1" aria-hidden="true" />
                ) : (
                  <Eye className="h-3 w-3 mr-1" aria-hidden="true" />
                )}
                {showTokens ? '隐藏' : '显示'} API Key
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Current Config Dialog */}
      <Dialog open={showCurrentConfig} onOpenChange={setShowCurrentConfig}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>当前 Gemini 配置</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {currentConfig ? (
              <div className="space-y-3">
                {currentConfig.selectedAuthType && (
                  <div>
                    <p className="font-medium text-sm">认证方式</p>
                    <p className="text-sm text-muted-foreground font-mono bg-muted p-2 rounded">
                      {currentConfig.selectedAuthType === 'oauth-personal' ? 'Google OAuth (官方)' :
                       currentConfig.selectedAuthType === 'gemini-api-key' ? 'API Key (第三方)' :
                       currentConfig.selectedAuthType}
                    </p>
                  </div>
                )}
                {currentConfig.apiKey && (
                  <div>
                    <p className="font-medium text-sm">API Key</p>
                    <p className="text-sm text-muted-foreground font-mono bg-muted p-2 rounded">
                      {showTokens ? currentConfig.apiKey : maskToken(currentConfig.apiKey)}
                    </p>
                  </div>
                )}
                {currentConfig.baseUrl && (
                  <div>
                    <p className="font-medium text-sm">Base URL</p>
                    <p className="text-sm text-muted-foreground font-mono bg-muted p-2 rounded">
                      {currentConfig.baseUrl}
                    </p>
                  </div>
                )}
                {currentConfig.model && (
                  <div>
                    <p className="font-medium text-sm">Model</p>
                    <p className="text-sm text-muted-foreground font-mono bg-muted p-2 rounded">
                      {currentConfig.model}
                    </p>
                  </div>
                )}

                {/* .env content */}
                <div>
                  <p className="font-medium text-sm">~/.gemini/.env</p>
                  <pre className="text-xs text-muted-foreground font-mono bg-muted p-2 rounded overflow-auto max-h-32">
                    {Object.keys(currentConfig.env).length > 0
                      ? Object.entries(currentConfig.env).map(([k, v]) => `${k}=${showTokens ? v : maskToken(v)}`).join('\n')
                      : '(空)'}
                  </pre>
                </div>

                {/* settings.json */}
                {currentConfig.settings && Object.keys(currentConfig.settings).length > 0 && (
                  <div>
                    <p className="font-medium text-sm">~/.gemini/settings.json (摘要)</p>
                    <pre className="text-xs text-muted-foreground font-mono bg-muted p-2 rounded overflow-auto max-h-32">
                      {JSON.stringify(currentConfig.settings.security || {}, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Show/hide tokens toggle in dialog */}
                <div className="flex justify-center pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowTokens(!showTokens)}
                    className="text-xs"
                  >
                    {showTokens ? (
                      <EyeOff className="h-3 w-3 mr-1" aria-hidden="true" />
                    ) : (
                      <Eye className="h-3 w-3 mr-1" aria-hidden="true" />
                    )}
                    {showTokens ? '隐藏' : '显示'} API Key
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">未检测到 Gemini 配置文件</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    请选择一个代理商进行配置，或使用官方 OAuth 登录
                  </p>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Provider Form Dialog */}
      <Dialog open={showForm} onOpenChange={handleFormCancel}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProvider ? '编辑 Gemini 代理商' : '添加 Gemini 代理商'}</DialogTitle>
          </DialogHeader>
          <GeminiProviderForm
            initialData={editingProvider || undefined}
            onSubmit={handleFormSubmit}
            onCancel={handleFormCancel}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>确认删除 Gemini 代理商</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p>您确定要删除 Gemini 代理商 "{providerToDelete?.name}" 吗？</p>
            {providerToDelete && (
              <div className="p-3 bg-muted rounded-md">
                <p className="text-sm"><span className="font-medium">名称：</span>{providerToDelete.name}</p>
                {providerToDelete.description && (
                  <p className="text-sm"><span className="font-medium">描述：</span>{providerToDelete.description}</p>
                )}
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              此操作无法撤销，代理商配置将被永久删除。
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={cancelDeleteProvider}
              disabled={deleting === providerToDelete?.id}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteProvider}
              disabled={deleting === providerToDelete?.id}
            >
              {deleting === providerToDelete?.id ? '删除中...' : '确认删除'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center p-4 pointer-events-none">
          <div className="pointer-events-auto">
            <Toast
              message={toastMessage.message}
              type={toastMessage.type}
              onDismiss={() => setToastMessage(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
