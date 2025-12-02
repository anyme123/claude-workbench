import { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
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
  Sparkles,
  Key,
} from 'lucide-react';
import { type GeminiProviderConfig } from '@/lib/api';
import { Toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import {
  geminiProviderPresets,
  generateThirdPartyEnv,
  extractApiKeyFromEnv,
  extractBaseUrlFromEnv,
  extractModelFromEnv,
  type ProviderCategory,
} from '@/config/geminiProviderPresets';

interface GeminiProviderFormProps {
  initialData?: GeminiProviderConfig;
  onSubmit: (formData: Omit<GeminiProviderConfig, 'id'>) => Promise<void>;
  onCancel: () => void;
}

export default function GeminiProviderForm({
  initialData,
  onSubmit,
  onCancel
}: GeminiProviderFormProps) {
  // 预设选择
  const [selectedPreset, setSelectedPreset] = useState<string>('');

  // 基础字段
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [websiteUrl, setWebsiteUrl] = useState(initialData?.websiteUrl || '');
  const [category, setCategory] = useState<ProviderCategory>(
    initialData?.category || 'custom'
  );

  // Gemini 特有字段
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [modelName, setModelName] = useState('gemini-3-pro-preview');

  // 状态
  const [loading, setLoading] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const isEditing = !!initialData;

  // 初始化编辑模式的数据
  useEffect(() => {
    if (initialData) {
      setApiKey(extractApiKeyFromEnv(initialData.env));
      setBaseUrl(extractBaseUrlFromEnv(initialData.env));
      setModelName(extractModelFromEnv(initialData.env) || 'gemini-3-pro-preview');
    }
  }, [initialData]);

  // 预设选择变更处理
  const handlePresetChange = useCallback((presetId: string) => {
    setSelectedPreset(presetId);
    const preset = geminiProviderPresets.find(p => p.id === presetId);
    if (preset) {
      setName(preset.name);
      setDescription(preset.description || '');
      setWebsiteUrl(preset.websiteUrl);
      setCategory(preset.category || 'custom');
      setApiKey(''); // 清空 API Key，用户需要填写
      setBaseUrl(extractBaseUrlFromEnv(preset.env));
      setModelName(extractModelFromEnv(preset.env) || 'gemini-3-pro-preview');
    }
  }, []);

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

      // 构建环境变量
      let finalEnv: Record<string, string>;

      if (category === 'official') {
        // 官方供应商不需要环境变量
        finalEnv = {};
      } else {
        // 第三方供应商需要环境变量
        finalEnv = generateThirdPartyEnv(apiKey, baseUrl, modelName);
      }

      const submitData: Omit<GeminiProviderConfig, 'id'> = {
        name: name.trim(),
        description: description.trim(),
        websiteUrl: websiteUrl.trim(),
        category,
        env: finalEnv,
        isOfficial: category === 'official',
      };

      await onSubmit(submitData);
    } catch (error) {
      console.error('Failed to save Gemini provider config:', error);
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
                {geminiProviderPresets.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    <div className="flex items-center gap-2">
                      <span>{preset.name}</span>
                      {preset.category === 'official' && (
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
                placeholder="例如：PackyCode"
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
              placeholder="例如：PackyCode API 服务"
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

        {/* Gemini 配置 */}
        {category !== 'official' && (
          <div className="space-y-4 pt-4 border-t">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Key className="h-4 w-4" />
              Gemini 配置
            </h3>

            {/* API Key */}
            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key *</Label>
              <div className="relative">
                <Input
                  id="apiKey"
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIza..."
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
                将写入 ~/.gemini/.env 的 GEMINI_API_KEY
              </p>
            </div>

            {/* Base URL */}
            <div className="space-y-2">
              <Label htmlFor="baseUrl">API 地址 *</Label>
              <Input
                id="baseUrl"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.example.com"
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                将写入 ~/.gemini/.env 的 GOOGLE_GEMINI_BASE_URL
              </p>
            </div>

            {/* Model Name */}
            <div className="space-y-2">
              <Label htmlFor="modelName">模型名称</Label>
              <Input
                id="modelName"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                placeholder="gemini-3-pro-preview"
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                将写入 ~/.gemini/.env 的 GEMINI_MODEL
              </p>
            </div>
          </div>
        )}

        {/* 官方供应商说明 */}
        {category === 'official' && (
          <div className="pt-4 border-t">
            <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-950 rounded-md">
              <Sparkles className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                  官方 Google OAuth 认证
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  使用 Google 官方 OAuth 登录，无需配置 API Key。
                  首次使用时会弹出浏览器进行 Google 账号登录授权。
                </p>
              </div>
            </div>
          </div>
        )}
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
