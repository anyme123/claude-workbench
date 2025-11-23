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
import { Popover } from '@/components/ui/popover';
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

  // Check Codex availability on mount
  useEffect(() => {
    checkCodexAvailability();
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
    />
  );
};

export default ExecutionEngineSelector;
