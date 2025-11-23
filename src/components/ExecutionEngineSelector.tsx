/**
 * ExecutionEngineSelector Component
 *
 * Allows users to switch between Claude Code and Codex execution engines
 * with appropriate configuration options for each.
 */

import React, { useState, useEffect } from 'react';
import { Settings, Zap, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import type { CodexExecutionMode } from '@/types/codex';

// ============================================================================
// Type Definitions
// ============================================================================

export type ExecutionEngine = 'claude' | 'codex';

export interface ExecutionEngineConfig {
  engine: ExecutionEngine;
  // Codex-specific config
  codexMode?: CodexExecutionMode;
  codexModel?: string;
  codexApiKey?: string;
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
  const [codexError, setCodexError] = useState<string | null>(null);
  const [isCheckingCodex, setIsCheckingCodex] = useState(false);

  // Check Codex availability on mount
  useEffect(() => {
    checkCodexAvailability();
  }, []);

  const checkCodexAvailability = async () => {
    console.log('[ExecutionEngineSelector] 🔍 Checking Codex availability...');
    console.log('[ExecutionEngineSelector] 📡 Calling api.checkCodexAvailability()...');
    setIsCheckingCodex(true);

    try {
      // 检查 api 对象是否存在
      if (!api || typeof api.checkCodexAvailability !== 'function') {
        throw new Error('api.checkCodexAvailability is not available');
      }

      console.log('[ExecutionEngineSelector] ✅ API method exists, calling...');
      const result = await api.checkCodexAvailability();
      console.log('[ExecutionEngineSelector] 📊 Check result:', JSON.stringify(result, null, 2));

      setCodexAvailable(result.available);
      setCodexVersion(result.version || null);
      setCodexError(result.error || null);

      if (result.available) {
        console.log('[ExecutionEngineSelector] ✅ Codex is available:', result.version);
        alert(`✅ Codex 检测成功!\n版本: ${result.version}`);
      } else {
        console.warn('[ExecutionEngineSelector] ❌ Codex not available:', result.error);
        alert(`❌ Codex 不可用\n错误: ${result.error}`);
      }
    } catch (error) {
      console.error('[ExecutionEngineSelector] ❌ Exception during check:', error);
      console.error('[ExecutionEngineSelector] ❌ Error stack:', error instanceof Error ? error.stack : 'N/A');
      setCodexAvailable(false);
      const errorMsg = error instanceof Error ? error.message : String(error);
      setCodexError(errorMsg);
      alert(`❌ 检查失败!\n错误: ${errorMsg}`);
    } finally {
      setIsCheckingCodex(false);
      console.log('[ExecutionEngineSelector] 🏁 Check complete. Available:', codexAvailable);
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
    <>
      <div className={`flex items-center gap-2 ${className}`}>
        {/* Engine Selector */}
        <Select value={value.engine} onValueChange={handleEngineChange}>
          <SelectTrigger className="w-[160px]">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              <SelectValue />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="claude">
              <div className="flex items-center justify-between w-full">
                <span>Claude Code</span>
                {value.engine === 'claude' && <Check className="h-4 w-4 ml-2" />}
              </div>
            </SelectItem>
            <SelectItem value="codex" disabled={!codexAvailable}>
              <div className="flex flex-col items-start">
                <div className="flex items-center justify-between w-full">
                  <span>Codex</span>
                  {value.engine === 'codex' && <Check className="h-4 w-4 ml-2" />}
                </div>
                {!codexAvailable && (
                  <span className="text-xs text-muted-foreground">未安装</span>
                )}
                {codexAvailable && codexVersion && (
                  <span className="text-xs text-muted-foreground">{codexVersion}</span>
                )}
              </div>
            </SelectItem>
          </SelectContent>
        </Select>

        {/* Settings Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowSettings(true)}
          className="h-8 w-8"
        >
          <Settings className="h-4 w-4" />
        </Button>

        {/* Quick Mode Indicator (Codex only) */}
        {value.engine === 'codex' && (
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <span className="font-medium">
              {value.codexMode === 'read-only' && '只读'}
              {value.codexMode === 'full-auto' && '编辑'}
              {value.codexMode === 'danger-full-access' && '完全访问'}
            </span>
          </div>
        )}
      </div>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>执行引擎设置</DialogTitle>
            <DialogDescription>
              配置 {value.engine === 'claude' ? 'Claude Code' : 'Codex'} 的执行参数
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {value.engine === 'codex' ? (
              <>
                {/* Codex Mode */}
                <div className="space-y-2">
                  <Label>执行模式</Label>
                  <Select
                    value={value.codexMode || 'read-only'}
                    onValueChange={(v) => handleCodexModeChange(v as CodexExecutionMode)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="read-only">
                        <div className="flex flex-col items-start">
                          <span>只读模式</span>
                          <span className="text-xs text-muted-foreground">
                            安全模式,只能读取文件
                          </span>
                        </div>
                      </SelectItem>
                      <SelectItem value="full-auto">
                        <div className="flex flex-col items-start">
                          <span>编辑模式</span>
                          <span className="text-xs text-muted-foreground">
                            允许编辑文件
                          </span>
                        </div>
                      </SelectItem>
                      <SelectItem value="danger-full-access">
                        <div className="flex flex-col items-start">
                          <span className="text-destructive">完全访问模式</span>
                          <span className="text-xs text-muted-foreground">
                            ⚠️ 允许网络访问 (谨慎使用)
                          </span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Codex Model */}
                <div className="space-y-2">
                  <Label>模型</Label>
                  <Input
                    value={value.codexModel || 'gpt-5.1-codex-max'}
                    onChange={(e) => handleCodexModelChange(e.target.value)}
                    placeholder="gpt-5.1-codex-max"
                  />
                  <p className="text-xs text-muted-foreground">
                    默认: gpt-5.1-codex-max
                  </p>
                </div>

                {/* Codex Availability Status */}
                <div className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Codex CLI 状态</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={checkCodexAvailability}
                      disabled={isCheckingCodex}
                    >
                      {isCheckingCodex ? '检查中...' : '重新检查'}
                    </Button>
                  </div>
                  <div className="text-xs space-y-1">
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-2 w-2 rounded-full ${
                          isCheckingCodex ? 'bg-yellow-500 animate-pulse' :
                          codexAvailable ? 'bg-green-500' : 'bg-red-500'
                        }`}
                      />
                      <span>
                        {isCheckingCodex ? '检查中...' :
                         codexAvailable ? '已安装并可用' : '未安装或不可用'}
                      </span>
                    </div>
                    {codexVersion && (
                      <div className="text-muted-foreground">版本: {codexVersion}</div>
                    )}
                    {!codexAvailable && codexError && (
                      <div className="text-destructive text-xs mt-2 p-2 bg-destructive/10 rounded">
                        <div className="font-medium mb-1">错误详情:</div>
                        <div className="font-mono">{codexError}</div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              // Claude Code settings (minimal for now)
              <div className="text-sm text-muted-foreground">
                <p>Claude Code 使用项目的默认配置。</p>
                <p className="mt-2">
                  可以在设置中配置权限、模型等选项。
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button onClick={() => setShowSettings(false)}>
              完成
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ExecutionEngineSelector;
