/**
 * ExecutionEngineSelector Component
 *
 * Allows users to switch between Claude Code and Codex execution engines
 * with appropriate configuration options for each.
 */

import React, { useState, useEffect } from 'react';
import { Settings, Zap, Check, Monitor, Terminal } from 'lucide-react';
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
import type { CodexExecutionMode } from '@/types/codex';

// ============================================================================
// Type Definitions
// ============================================================================

export type ExecutionEngine = 'claude' | 'codex';
export type CodexRuntimeMode = 'auto' | 'native' | 'wsl';

export interface ExecutionEngineConfig {
  engine: ExecutionEngine;
  // Codex-specific config
  codexMode?: CodexExecutionMode;
  codexModel?: string;
  codexApiKey?: string;
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

  // Check Codex availability and mode config on mount
  useEffect(() => {
    checkCodexAvailability();
    loadCodexModeConfig();
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

  const handleCodexRuntimeModeChange = async (mode: CodexRuntimeMode) => {
    if (!codexModeConfig) return;

    setSavingConfig(true);
    try {
      const message = await api.setCodexModeConfig(mode, codexModeConfig.wslDistro);
      setCodexModeConfig({ ...codexModeConfig, mode });
      // 询问用户是否重启
      if (confirm(message)) {
        await relaunchApp();
      }
    } catch (error) {
      console.error('[ExecutionEngineSelector] Failed to save Codex mode config:', error);
      alert('保存配置失败: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setSavingConfig(false);
    }
  };

  const handleWslDistroChange = async (distro: string) => {
    if (!codexModeConfig) return;

    const newDistro = distro === '__default__' ? null : distro;
    setSavingConfig(true);
    try {
      const message = await api.setCodexModeConfig(codexModeConfig.mode, newDistro);
      setCodexModeConfig({ ...codexModeConfig, wslDistro: newDistro });
      // 询问用户是否重启
      if (confirm(message)) {
        await relaunchApp();
      }
    } catch (error) {
      console.error('[ExecutionEngineSelector] Failed to save WSL distro:', error);
      alert('保存配置失败: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setSavingConfig(false);
    }
  };

  const handleEngineChange = (engine: ExecutionEngine) => {
    if (engine === 'codex' && !codexAvailable) {
      alert('Codex CLI 未安装或不可用。请先安装 Codex CLI。');
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
            <Zap className="h-4 w-4" />
            <span>{value.engine === 'claude' ? 'Claude Code' : 'Codex'}</span>
            {value.engine === 'codex' && value.codexMode && (
              <span className="text-xs text-muted-foreground">
                ({value.codexMode === 'read-only' ? '只读' : value.codexMode === 'full-auto' ? '编辑' : '完全访问'})
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
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={value.engine === 'claude' ? 'default' : 'outline'}
                className="justify-start"
                onClick={() => handleEngineChange('claude')}
              >
                <Check className={`mr-2 h-4 w-4 ${value.engine === 'claude' ? 'opacity-100' : 'opacity-0'}`} />
                Claude Code
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
