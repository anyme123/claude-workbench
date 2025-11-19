import React, { useState, useEffect } from "react";
import { Settings, RefreshCw, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  loadContextConfig,
  saveContextConfig,
  resetContextConfig,
  applyPreset,
  CONTEXT_PRESETS,
  type PromptContextConfig,
} from "@/lib/promptContextConfig";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PromptContextConfigSettingsProps {
  className?: string;
}

export const PromptContextConfigSettings: React.FC<PromptContextConfigSettingsProps> = ({
  className
}) => {
  const [config, setConfig] = useState<PromptContextConfig>(loadContextConfig());
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    const loaded = loadContextConfig();
    setConfig(loaded);
  }, []);

  const handleChange = (updates: Partial<PromptContextConfig>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    setHasChanges(true);
  };

  const handleSave = () => {
    saveContextConfig(config);
    setHasChanges(false);
  };

  const handleReset = () => {
    resetContextConfig();
    setConfig(loadContextConfig());
    setHasChanges(false);
  };

  const handleApplyPreset = (presetKey: keyof typeof CONTEXT_PRESETS) => {
    applyPreset(presetKey);
    setConfig(loadContextConfig());
    setHasChanges(false);
  };

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Settings className="h-5 w-5" />
            上下文提取配置
          </h3>
          <p className="text-sm text-muted-foreground">
            配置提示词优化时提取的会话上下文参数
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
          <Button onClick={handleSave} size="sm" disabled={!hasChanges}>
            保存配置
          </Button>
        </div>
      </div>

      {/* 预设模板 */}
      <Card className="p-4 bg-muted/30">
        <h4 className="text-sm font-medium mb-3">快速预设：</h4>
        <div className="flex flex-wrap gap-2">
          {Object.entries(CONTEXT_PRESETS).map(([key, preset]) => (
            <TooltipProvider key={key}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleApplyPreset(key as keyof typeof CONTEXT_PRESETS)}
                  >
                    {preset.name}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{preset.description}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}
        </div>
      </Card>

      {/* 配置项 */}
      <Card className="p-6">
        <div className="space-y-6">
          {/* 最大消息数量 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label>最大消息数量</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-4 w-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>提取的最近消息数量，越多上下文越完整但会消耗更多 token</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Badge variant="secondary">{config.maxMessages} 条</Badge>
            </div>
            <Slider
              value={[config.maxMessages]}
              onValueChange={(values: number[]) => handleChange({ maxMessages: values[0] })}
              min={3}
              max={50}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>3 条（最少）</span>
              <span>50 条（最多）</span>
            </div>
          </div>

          {/* 助手消息长度 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label>助手消息最大长度</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-4 w-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>单条助手回复的最大字符数，超过会被截断</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Badge variant="secondary">{config.maxAssistantMessageLength} 字符</Badge>
            </div>
            <Slider
              value={[config.maxAssistantMessageLength]}
              onValueChange={(values: number[]) => handleChange({ maxAssistantMessageLength: values[0] })}
              min={200}
              max={10000}
              step={100}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>200 字符</span>
              <span>10,000 字符</span>
            </div>
          </div>

          {/* 用户消息长度 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label>用户消息最大长度</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-4 w-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>单条用户提问的最大字符数，超过会被截断</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Badge variant="secondary">{config.maxUserMessageLength} 字符</Badge>
            </div>
            <Slider
              value={[config.maxUserMessageLength]}
              onValueChange={(values: number[]) => handleChange({ maxUserMessageLength: values[0] })}
              min={200}
              max={5000}
              step={100}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>200 字符</span>
              <span>5,000 字符</span>
            </div>
          </div>

          {/* 包含执行结果 */}
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <Label>包含执行结果</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-4 w-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>是否在上下文中包含命令执行结果</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Switch
              checked={config.includeExecutionResults}
              onCheckedChange={(checked) => handleChange({ includeExecutionResults: checked })}
            />
          </div>

          {/* 执行结果长度（仅在启用时显示） */}
          {config.includeExecutionResults && (
            <div className="space-y-3 pl-6 border-l-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label className="text-sm">执行结果最大长度</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="h-4 w-4 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>单条执行结果的最大字符数，超过会被截断</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Badge variant="secondary">{config.maxExecutionResultLength} 字符</Badge>
              </div>
              <Slider
                value={[config.maxExecutionResultLength]}
                onValueChange={(values: number[]) => handleChange({ maxExecutionResultLength: values[0] })}
                min={100}
                max={2000}
                step={50}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>100 字符</span>
                <span>2,000 字符</span>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* 配置说明 */}
      <Card className="p-4 bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
        <div className="flex gap-3">
          <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-2 text-sm">
            <p className="font-medium text-blue-900 dark:text-blue-100">
              配置建议：
            </p>
            <ul className="space-y-1 text-blue-800 dark:text-blue-200 list-disc list-inside">
              <li><strong>简单任务</strong>：5-10 条消息，500-1000 字符</li>
              <li><strong>一般任务</strong>：10-20 条消息，1000-2000 字符（推荐）</li>
              <li><strong>复杂任务</strong>：20-50 条消息，2000-5000 字符</li>
              <li>更多上下文会提高优化质量，但也会增加 API 调用成本</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
};

