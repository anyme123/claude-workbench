/**
 * ExecutionEngineSelector Component
 *
 * Allows users to switch between Claude Code, Codex, and Gemini CLI execution engines
 * with appropriate configuration options for each.
 */

import React, { useState, useEffect } from 'react';
import { Settings, Zap, Check, Monitor, Terminal, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { relaunchApp } from '@/lib/updater';
import { ask, message } from '@tauri-apps/plugin-dialog';
import type { CodexExecutionMode } from '@/types/codex';

// ============================================================================
// Type Definitions
// ============================================================================

export type ExecutionEngine = 'claude' | 'codex' | 'gemini';
export type CodexRuntimeMode = 'auto' | 'native' | 'wsl';

export interface ExecutionEngineConfig {
  engine: ExecutionEngine;
  // Codex-specific config
  codexMode?: CodexExecutionMode;
  codexModel?: string;
  codexApiKey?: string;
  // Gemini-specific config
  geminiModel?: string;
  geminiApprovalMode?: 'auto_edit' | 'yolo' | 'default';
}

interface CodexModeConfig {
  mode: CodexRuntimeMode;
  wslDistro: string | null;
  actualMode: 'native' | 'wsl';
  nativeAvailable: boolean;
  wslAvailable: boolean;
  availableDistros: string[];
}

interface ExecutionEngineSelectorProps {
  value: ExecutionEngineConfig;
  onChange: (config: ExecutionEngineConfig) => void;
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export const ExecutionEngineSelector: React.FC<ExecutionEngineSelectorProps> = ({
  value,
  onChange,
  className = '',
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const [codexAvailable, setCodexAvailable] = useState(false);
  const [codexVersion, setCodexVersion] = useState<string | null>(null);
  const [codexModeConfig, setCodexModeConfig] = useState<CodexModeConfig | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  // Gemini state
  const [geminiAvailable, setGeminiAvailable] = useState(false);
  const [geminiVersion, setGeminiVersion] = useState<string | null>(null);

  // Check Codex and Gemini availability on mount
  useEffect(() => {
    checkCodexAvailability();
    loadCodexModeConfig();
    checkGeminiAvailability();
  }, []);

  const checkCodexAvailability = async () => {
    try {
      if (!api || typeof api.checkCodexAvailability !== 'function') {
        throw new Error('api.checkCodexAvailability is not available');
      }

      const result = await api.checkCodexAvailability();

      setCodexAvailable(result.available);
      setCodexVersion(result.version || null);
    } catch (error) {
      console.error('[ExecutionEngineSelector] Failed to check Codex availability:', error);
      setCodexAvailable(false);
    }
  };

  const loadCodexModeConfig = async () => {
    try {
      if (!api || typeof api.getCodexModeConfig !== 'function') {
        return;
      }
      const config = await api.getCodexModeConfig();
      setCodexModeConfig(config);
    } catch (error) {
      console.error('[ExecutionEngineSelector] Failed to load Codex mode config:', error);
    }
  };

  const checkGeminiAvailability = async () => {
    try {
      if (!api || typeof api.checkGeminiInstalled !== 'function') {
        console.warn('[ExecutionEngineSelector] api.checkGeminiInstalled is not available');
        return;
      }

      const result = await api.checkGeminiInstalled();
      setGeminiAvailable(result.installed);
      setGeminiVersion(result.version || null);
    } catch (error) {
      console.error('[ExecutionEngineSelector] Failed to check Gemini availability:', error);
      setGeminiAvailable(false);
    }
  };

  const handleCodexRuntimeModeChange = async (mode: CodexRuntimeMode) => {
    if (!codexModeConfig) return;

    setSavingConfig(true);
    try {
      await api.setCodexModeConfig(mode, codexModeConfig.wslDistro);
      setCodexModeConfig({ ...codexModeConfig, mode });
      // 使用 Tauri 原生对话框询问用户是否重启
      const shouldRestart = await ask('配置已保存。是否立即重启应用以使更改生效？', {
        title: '重启应用',
        kind: 'info',
        okLabel: '立即重启',
        cancelLabel: '稍后重启',
      });
      if (shouldRestart) {
        try {
          await relaunchApp();
        } catch (restartError) {
          console.error('[ExecutionEngineSelector] Failed to restart:', restartError);
          await message('配置已保存，但自动重启失败。请手动重启应用以使更改生效。', {
            title: '提示',
            kind: 'warning',
          });
        }
      }
    } catch (error) {
      console.error('[ExecutionEngineSelector] Failed to save Codex mode config:', error);
      await message('保存配置失败: ' + (error instanceof Error ? error.message : String(error)), {
        title: '错误',
        kind: 'error',
      });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleWslDistroChange = async (distro: string) => {
    if (!codexModeConfig) return;

    const newDistro = distro === '__default__' ? null : distro;
    setSavingConfig(true);
    try {
      await api.setCodexModeConfig(codexModeConfig.mode, newDistro);
      setCodexModeConfig({ ...codexModeConfig, wslDistro: newDistro });
      // 使用 Tauri 原生对话框询问用户是否重启
      const shouldRestart = await ask('配置已保存。是否立即重启应用以使更改生效？', {
        title: '重启应用',
        kind: 'info',
        okLabel: '立即重启',
        cancelLabel: '稍后重启',
      });
      if (shouldRestart) {
        try {
          await relaunchApp();
        } catch (restartError) {
          console.error('[ExecutionEngineSelector] Failed to restart:', restartError);
          await message('配置已保存，但自动重启失败。请手动重启应用以使更改生效。', {
            title: '提示',
            kind: 'warning',
          });
        }
      }
    } catch (error) {
      console.error('[ExecutionEngineSelector] Failed to save WSL distro:', error);
      await message('保存配置失败: ' + (error instanceof Error ? error.message : String(error)), {
        title: '错误',
        kind: 'error',
      });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleEngineChange = (engine: ExecutionEngine) => {
    if (engine === 'codex' && !codexAvailable) {
      alert('Codex CLI 未安装或不可用。请先安装 Codex CLI。');
      return;
    }

    if (engine === 'gemini' && !geminiAvailable) {
      alert('Gemini CLI 未安装或不可用。请运行 npm install -g @google/gemini-cli 安装。');
      return;
    }

    onChange({
      ...value,
      engine,
    });
  };

  const handleCodexModeChange = (mode: CodexExecutionMode) => {
    onChange({
      ...value,
      codexMode: mode,
    });
  };

  const handleCodexModelChange = (model: string) => {
    onChange({
      ...value,
      codexModel: model,
    });
  };

  const handleGeminiModelChange = (model: string) => {
    onChange({
      ...value,
      geminiModel: model,
    });
  };

  const handleGeminiApprovalModeChange = (mode: 'auto_edit' | 'yolo' | 'default') => {
    onChange({
      ...value,
      geminiApprovalMode: mode,
    });
  };

  // Get display name for current engine
  const getEngineDisplayName = () => {
    switch (value.engine) {
      case 'claude':
        return 'Claude Code';
      case 'codex':
        return 'Codex';
      case 'gemini':
        return 'Gemini';
      default:
        return 'Claude Code';
    }
  };

  return (
    <Popover
      open={showSettings}
      onOpenChange={setShowSettings}
      trigger={
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={showSettings}
          className={`justify-between ${className}`}
        >
          <div className="flex items-center gap-2">
            {value.engine === 'gemini' ? (
              <Sparkles className="h-4 w-4" />
            ) : (
              <Zap className="h-4 w-4" />
            )}
            <span>{getEngineDisplayName()}</span>
            {value.engine === 'codex' && value.codexMode && (
              <span className="text-xs text-muted-foreground">
                ({value.codexMode === 'read-only' ? '只读' : value.codexMode === 'full-auto' ? '编辑' : '完全访问'})
              </span>
            )}
            {value.engine === 'gemini' && value.geminiApprovalMode && (
              <span className="text-xs text-muted-foreground">
                ({value.geminiApprovalMode === 'yolo' ? 'YOLO' : value.geminiApprovalMode === 'auto_edit' ? '自动编辑' : '默认'})
              </span>
            )}
          </div>
          <Settings className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      }
      content={
        <div className="space-y-4 p-4">
          {/* Engine Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">执行引擎</Label>
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant={value.engine === 'claude' ? 'default' : 'outline'}
                className="justify-start"
                onClick={() => handleEngineChange('claude')}
              >
                <Check className={`mr-2 h-4 w-4 ${value.engine === 'claude' ? 'opacity-100' : 'opacity-0'}`} />
                Claude
              </Button>
              <Button
                variant={value.engine === 'codex' ? 'default' : 'outline'}
                className="justify-start"
                onClick={() => handleEngineChange('codex')}
                disabled={!codexAvailable}
              >
                <Check className={`mr-2 h-4 w-4 ${value.engine === 'codex' ? 'opacity-100' : 'opacity-0'}`} />
                Codex
              </Button>
              <Button
                variant={value.engine === 'gemini' ? 'default' : 'outline'}
                className="justify-start"
                onClick={() => handleEngineChange('gemini')}
                disabled={!geminiAvailable}
              >
                <Check className={`mr-2 h-4 w-4 ${value.engine === 'gemini' ? 'opacity-100' : 'opacity-0'}`} />
                Gemini
              </Button>
            </div>
          </div>

          {/* Codex-specific settings */}
          {value.engine === 'codex' && (
            <>
              <div className="h-px bg-border" />

              {/* Execution Mode */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">执行模式</Label>
                <Select
                  value={value.codexMode || 'read-only'}
                  onValueChange={(v) => handleCodexModeChange(v as CodexExecutionMode)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="read-only">
                      <div>
                        <div className="font-medium">只读模式</div>
                        <div className="text-xs text-muted-foreground">安全模式，只能读取文件</div>
                      </div>
                    </SelectItem>
                    <SelectItem value="full-auto">
                      <div>
                        <div className="font-medium">编辑模式</div>
                        <div className="text-xs text-muted-foreground">允许编辑文件</div>
                      </div>
                    </SelectItem>
                    <SelectItem value="danger-full-access">
                      <div>
                        <div className="font-medium text-destructive">完全访问模式</div>
                        <div className="text-xs text-muted-foreground">⚠️ 允许网络访问</div>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Model */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">模型</Label>
                <Input
                  value={value.codexModel || 'gpt-5.1-codex-max'}
                  onChange={(e) => handleCodexModelChange(e.target.value)}
                  placeholder="gpt-5.1-codex-max"
                  className="font-mono text-sm"
                />
              </div>

              {/* Status */}
              <div className="rounded-md border p-2 bg-muted/50">
                <div className="flex items-center gap-2 text-xs">
                  <div className={`h-2 w-2 rounded-full ${codexAvailable ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span>{codexAvailable ? '已安装' : '未安装'}</span>
                  {codexVersion && <span className="text-muted-foreground">• {codexVersion}</span>}
                </div>
              </div>

              {/* WSL Mode Configuration (Windows only) */}
              {codexModeConfig && (codexModeConfig.nativeAvailable || codexModeConfig.wslAvailable) && (
                <>
                  <div className="h-px bg-border" />

                  <div className="space-y-2">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <Terminal className="h-4 w-4" />
                      运行环境
                    </Label>
                    <Select
                      value={codexModeConfig.mode}
                      onValueChange={(v) => handleCodexRuntimeModeChange(v as CodexRuntimeMode)}
                      disabled={savingConfig}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">
                          <div>
                            <div className="font-medium">自动检测</div>
                            <div className="text-xs text-muted-foreground">原生优先，WSL 后备</div>
                          </div>
                        </SelectItem>
                        <SelectItem value="native" disabled={!codexModeConfig.nativeAvailable}>
                          <div className="flex items-center gap-2">
                            <Monitor className="h-3 w-3" />
                            <div>
                              <div className="font-medium">Windows 原生</div>
                              <div className="text-xs text-muted-foreground">
                                {codexModeConfig.nativeAvailable ? '使用 Windows 版 Codex' : '未安装'}
                              </div>
                            </div>
                          </div>
                        </SelectItem>
                        <SelectItem value="wsl" disabled={!codexModeConfig.wslAvailable}>
                          <div className="flex items-center gap-2">
                            <Terminal className="h-3 w-3" />
                            <div>
                              <div className="font-medium">WSL</div>
                              <div className="text-xs text-muted-foreground">
                                {codexModeConfig.wslAvailable ? '使用 WSL 中的 Codex' : '未安装'}
                              </div>
                            </div>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* WSL Distro Selection */}
                  {codexModeConfig.mode === 'wsl' && codexModeConfig.availableDistros.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">WSL 发行版</Label>
                      <Select
                        value={codexModeConfig.wslDistro || '__default__'}
                        onValueChange={handleWslDistroChange}
                        disabled={savingConfig}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__default__">
                            <div className="text-muted-foreground">默认（自动选择）</div>
                          </SelectItem>
                          {codexModeConfig.availableDistros.map((distro) => (
                            <SelectItem key={distro} value={distro}>
                              {distro}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Current Runtime Status */}
                  <div className="rounded-md border p-2 bg-muted/30 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">当前运行环境:</span>
                      <span className="font-medium">
                        {codexModeConfig.actualMode === 'wsl' ? (
                          <span className="flex items-center gap-1">
                            <Terminal className="h-3 w-3" />
                            WSL
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <Monitor className="h-3 w-3" />
                            Windows 原生
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* Gemini-specific settings */}
          {value.engine === 'gemini' && (
            <>
              <div className="h-px bg-border" />

              {/* Model Selection */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">模型</Label>
                <div className="space-y-2">
                  {/* Preset model selector */}
                  <Select
                    value={
                      ['gemini-3-pro-preview', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash-exp'].includes(value.geminiModel || '')
                        ? value.geminiModel
                        : '__custom__'
                    }
                    onValueChange={(val) => {
                      if (val === '__custom__') {
                        // Switch to custom input mode
                        onChange({
                          ...value,
                          geminiModel: '',
                        });
                      } else {
                        handleGeminiModelChange(val);
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gemini-3-pro-preview">
                        <div>
                          <div className="font-medium">Gemini 3 Pro (Preview)</div>
                          <div className="text-xs text-muted-foreground">最新实验模型</div>
                        </div>
                      </SelectItem>
                      <SelectItem value="gemini-2.5-pro">
                        <div>
                          <div className="font-medium">Gemini 2.5 Pro</div>
                          <div className="text-xs text-muted-foreground">稳定版，1M 上下文</div>
                        </div>
                      </SelectItem>
                      <SelectItem value="gemini-2.5-flash">
                        <div>
                          <div className="font-medium">Gemini 2.5 Flash</div>
                          <div className="text-xs text-muted-foreground">快速高效</div>
                        </div>
                      </SelectItem>
                      <SelectItem value="gemini-2.0-flash-exp">
                        <div>
                          <div className="font-medium">Gemini 2.0 Flash (实验)</div>
                          <div className="text-xs text-muted-foreground">实验性版本</div>
                        </div>
                      </SelectItem>
                      <SelectItem value="__custom__">
                        <div>
                          <div className="font-medium">✏️ 自定义模型</div>
                          <div className="text-xs text-muted-foreground">手动输入模型名称</div>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Custom model input (always visible for transparency) */}
                  {!['gemini-3-pro-preview', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash-exp'].includes(value.geminiModel || '') && (
                    <div>
                      <Input
                        placeholder="输入自定义模型名称"
                        value={value.geminiModel || ''}
                        onChange={(e) => handleGeminiModelChange(e.target.value)}
                        className="text-sm font-mono"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        💡 查看可用模型: <a href="https://ai.google.dev/gemini-api/docs/models" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">Gemini 文档</a>
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Approval Mode */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">审批模式</Label>
                <Select
                  value={value.geminiApprovalMode || 'auto_edit'}
                  onValueChange={(v) => handleGeminiApprovalModeChange(v as 'auto_edit' | 'yolo' | 'default')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">
                      <div>
                        <div className="font-medium">默认</div>
                        <div className="text-xs text-muted-foreground">每次操作需确认</div>
                      </div>
                    </SelectItem>
                    <SelectItem value="auto_edit">
                      <div>
                        <div className="font-medium">自动编辑</div>
                        <div className="text-xs text-muted-foreground">自动批准文件编辑</div>
                      </div>
                    </SelectItem>
                    <SelectItem value="yolo">
                      <div>
                        <div className="font-medium text-destructive">YOLO 模式</div>
                        <div className="text-xs text-muted-foreground">⚠️ 自动批准所有操作</div>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Status */}
              <div className="rounded-md border p-2 bg-muted/50">
                <div className="flex items-center gap-2 text-xs">
                  <Sparkles className="h-3 w-3" />
                  <div className={`h-2 w-2 rounded-full ${geminiAvailable ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span>{geminiAvailable ? '已安装' : '未安装'}</span>
                  {geminiVersion && <span className="text-muted-foreground">• {geminiVersion}</span>}
                </div>
              </div>
            </>
          )}

          {/* Claude-specific settings */}
          {value.engine === 'claude' && (
            <div className="text-sm text-muted-foreground">
              <p>Claude Code 配置请前往设置页面。</p>
            </div>
          )}
        </div>
      }
      className="w-96"
      align="start"
      side="top"
    />
  );
};

export default ExecutionEngineSelector;
