import { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Save,
  X,
  Eye,
  EyeOff,
  Info,
  Loader2,
  FileCode,
  Key,
  Settings2,
} from 'lucide-react';
import { type CodexProviderConfig } from '@/lib/api';
import { Toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import {
  codexProviderPresets,
  generateThirdPartyAuth,
  generateThirdPartyConfig,
  extractBaseUrlFromConfig,
  extractModelFromConfig,
  extractApiKeyFromAuth,
  setBaseUrlInConfig,
  setModelInConfig,
  type ProviderCategory,
} from '@/config/codexProviderPresets';

interface CodexProviderFormProps {
  initialData?: CodexProviderConfig;
  onSubmit: (formData: Omit<CodexProviderConfig, 'id'>) => Promise<void>;
  onCancel: () => void;
}

export default function CodexProviderForm({
  initialData,
  onSubmit,
  onCancel
}: CodexProviderFormProps) {
  // 预设选择
  const [selectedPreset, setSelectedPreset] = useState<string>('');

  // 基础字段
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [websiteUrl, setWebsiteUrl] = useState(initialData?.websiteUrl || '');
  const [category, setCategory] = useState<ProviderCategory>(
    initialData?.category || 'custom'
  );

  // Codex 特有字段
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [modelName, setModelName] = useState('gpt-5-codex');

  // 原始配置（用于高级编辑）
  const [authJson, setAuthJson] = useState('{}');
  const [configToml, setConfigToml] = useState('');

  // 状态
  const [loading, setLoading] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const isEditing = !!initialData;

  // 初始化编辑模式的数据
  useEffect(() => {
    if (initialData) {
      setApiKey(extractApiKeyFromAuth(initialData.auth));
      setBaseUrl(extractBaseUrlFromConfig(initialData.config));
      setModelName(extractModelFromConfig(initialData.config) || 'gpt-5-codex');
      setAuthJson(JSON.stringify(initialData.auth, null, 2));
      setConfigToml(initialData.config);
    }
  }, [initialData]);

  // 预设选择变更处理
  const handlePresetChange = useCallback((presetId: string) => {
    setSelectedPreset(presetId);
    const preset = codexProviderPresets.find(p => p.id === presetId);
    if (preset) {
      setName(preset.name);
      setDescription(preset.description || '');
      setWebsiteUrl(preset.websiteUrl);
      setCategory(preset.category || 'custom');
      setApiKey(''); // 清空 API Key，用户需要填写
      setBaseUrl(extractBaseUrlFromConfig(preset.config));
      setModelName(extractModelFromConfig(preset.config) || 'gpt-5-codex');
      setAuthJson(JSON.stringify(preset.auth, null, 2));
      setConfigToml(preset.config);
    }
  }, []);

  // API Key 变更时更新 auth.json
  const handleApiKeyChange = useCallback((newKey: string) => {
    setApiKey(newKey);
    try {
      const auth = JSON.parse(authJson);
      auth.OPENAI_API_KEY = newKey;
      setAuthJson(JSON.stringify(auth, null, 2));
    } catch {
      setAuthJson(JSON.stringify(generateThirdPartyAuth(newKey), null, 2));
    }
  }, [authJson]);

  // Base URL 变更时更新 config.toml
  const handleBaseUrlChange = useCallback((newUrl: string) => {
    setBaseUrl(newUrl);
    if (configToml) {
      setConfigToml(setBaseUrlInConfig(configToml, newUrl));
    }
  }, [configToml]);

  // Model 变更时更新 config.toml
  const handleModelChange = useCallback((newModel: string) => {
    setModelName(newModel);
    if (configToml) {
      setConfigToml(setModelInConfig(configToml, newModel));
    }
  }, [configToml]);

  // 验证表单
  const validateForm = (): string | null => {
    if (!name.trim()) {
      return '请输入供应商名称';
    }
    // 官方供应商不需要额外验证
    if (category === 'official') {
      return null;
    }
    // 第三方供应商需要 API Key
    if (!apiKey.trim()) {
      return '请输入 API Key';
    }
    // 第三方供应商需要 Base URL
    if (!baseUrl.trim()) {
      return '请输入 API 地址';
    }
    if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      return 'API 地址必须以 http:// 或 https:// 开头';
    }
    return null;
  };

  // 提交表单
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const error = validateForm();
    if (error) {
      setToastMessage({ message: error, type: 'error' });
      return;
    }

    try {
      setLoading(true);

      // 构建最终的 auth 和 config
      let finalAuth: Record<string, any>;
      let finalConfig: string;

      try {
        finalAuth = JSON.parse(authJson);
      } catch {
        finalAuth = generateThirdPartyAuth(apiKey);
      }

      if (configToml.trim()) {
        finalConfig = configToml;
      } else if (category !== 'official') {
        // 为第三方供应商生成默认配置
        const cleanName = name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        finalConfig = generateThirdPartyConfig(cleanName, baseUrl, modelName);
      } else {
        finalConfig = '';
      }

      const submitData: Omit<CodexProviderConfig, 'id'> = {
        name: name.trim(),
        description: description.trim(),
        websiteUrl: websiteUrl.trim(),
        category,
        auth: finalAuth,
        config: finalConfig,
        isOfficial: category === 'official',
      };

      await onSubmit(submitData);
    } catch (error) {
      console.error('Failed to save Codex provider config:', error);
      setToastMessage({
        message: `${isEditing ? '更新' : '添加'}配置失败: ${error}`,
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      onCancel();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 预设选择器（仅新建时显示） */}
      {!isEditing && (
        <Card className="p-4">
          <div className="space-y-2">
            <Label>选择预设模板</Label>
            <Select value={selectedPreset} onValueChange={handlePresetChange}>
              <SelectTrigger>
                <SelectValue placeholder="选择一个预设或从空白开始..." />
              </SelectTrigger>
              <SelectContent>
                {codexProviderPresets.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    <div className="flex items-center gap-2">
                      <span>{preset.name}</span>
                      {preset.isOfficial && (
                        <span className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 px-1.5 py-0.5 rounded">
                          官方
                        </span>
                      )}
                      {preset.isPartner && (
                        <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 px-1.5 py-0.5 rounded">
                          合作
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              选择预设可快速填充配置，也可以手动输入自定义配置
            </p>
          </div>
        </Card>
      )}

      <Card className="p-4 space-y-4">
        {/* 基本信息 */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <Info className="h-4 w-4" />
            基本信息
          </h3>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">供应商名称 *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：AiHubMix"
                disabled={loading}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">分类</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as ProviderCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="official">官方</SelectItem>
                  <SelectItem value="aggregator">聚合服务</SelectItem>
                  <SelectItem value="third_party">第三方</SelectItem>
                  <SelectItem value="custom">自定义</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">描述</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="例如：AiHubMix API 聚合服务"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="websiteUrl">官网地址</Label>
            <Input
              id="websiteUrl"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://example.com"
              disabled={loading}
            />
          </div>
        </div>

        {/* Codex 配置 */}
        {category !== 'official' && (
          <div className="space-y-4 pt-4 border-t">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Key className="h-4 w-4" />
              Codex 配置
            </h3>

            {/* API Key */}
            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key *</Label>
              <div className="relative">
                <Input
                  id="apiKey"
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => handleApiKeyChange(e.target.value)}
                  placeholder="sk-..."
                  disabled={loading}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1 h-8 w-8 p-0"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? (
                    <EyeOff className="h-3 w-3" />
                  ) : (
                    <Eye className="h-3 w-3" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                将写入 ~/.codex/auth.json
              </p>
            </div>

            {/* Base URL */}
            <div className="space-y-2">
              <Label htmlFor="baseUrl">API 地址 *</Label>
              <Input
                id="baseUrl"
                value={baseUrl}
                onChange={(e) => handleBaseUrlChange(e.target.value)}
                placeholder="https://api.example.com/v1"
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                第三方 API 的基础地址
              </p>
            </div>

            {/* Model Name */}
            <div className="space-y-2">
              <Label htmlFor="modelName">模型名称</Label>
              <Input
                id="modelName"
                value={modelName}
                onChange={(e) => handleModelChange(e.target.value)}
                placeholder="gpt-5-codex"
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                指定使用的模型，将写入 config.toml
              </p>
            </div>
          </div>
        )}

        {/* 高级配置 */}
        <div className="pt-4 border-t">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs"
          >
            <Settings2 className="h-3 w-3 mr-1" />
            {showAdvanced ? '隐藏' : '显示'}高级配置
          </Button>

          {showAdvanced && (
            <div className="mt-4 space-y-4">
              {/* auth.json */}
              <div className="space-y-2">
                <Label htmlFor="authJson" className="flex items-center gap-2">
                  <FileCode className="h-4 w-4" />
                  auth.json
                </Label>
                <Textarea
                  id="authJson"
                  value={authJson}
                  onChange={(e) => setAuthJson(e.target.value)}
                  placeholder='{"OPENAI_API_KEY": "sk-..."}'
                  className="font-mono text-xs h-24"
                  disabled={loading}
                />
                <p className="text-xs text-muted-foreground">
                  JSON 格式，将写入 ~/.codex/auth.json
                </p>
              </div>

              {/* config.toml */}
              <div className="space-y-2">
                <Label htmlFor="configToml" className="flex items-center gap-2">
                  <FileCode className="h-4 w-4" />
                  config.toml
                </Label>
                <Textarea
                  id="configToml"
                  value={configToml}
                  onChange={(e) => setConfigToml(e.target.value)}
                  placeholder='model_provider = "custom"&#10;model = "gpt-5-codex"'
                  className="font-mono text-xs h-48"
                  disabled={loading}
                />
                <p className="text-xs text-muted-foreground">
                  TOML 格式，将写入 ~/.codex/config.toml
                </p>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* 操作按钮 */}
      <div className="flex justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={handleClose}
          disabled={loading}
        >
          <X className="h-4 w-4 mr-2" aria-hidden="true" />
          取消
        </Button>
        <Button
          type="submit"
          disabled={loading}
          className={cn(
            "transition-all duration-200",
            loading && "scale-95 opacity-80"
          )}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
              {isEditing ? '更新中...' : '添加中...'}
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" aria-hidden="true" />
              {isEditing ? '更新配置' : '添加配置'}
            </>
          )}
        </Button>
      </div>

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
    </form>
  );
}
