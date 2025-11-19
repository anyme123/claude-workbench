import React, { useState, useEffect } from "react";
import {
  Bot,
  FolderOpen,
  Plus,
  Package,
  Sparkles,
  Loader2,
  ArrowLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

interface ClaudeExtensionsManagerProps {
  projectPath?: string;
  className?: string;
  onBack?: () => void;
}

interface PluginInfo {
  name: string;
  description?: string;
  version: string;
  author?: string;
  marketplace?: string;
  path: string;
  enabled: boolean;
  components: {
    commands: number;
    agents: number;
    skills: number;
    hooks: number;
    mcpServers: number;
  };
}

interface AgentFile {
  name: string;
  path: string;
  scope: 'project' | 'user';
  description?: string;
}

interface SkillFile {
  name: string;
  path: string;
  scope: 'project' | 'user';
  description?: string;
}

/**
 * Claude 扩展管理器
 * 
 * 根据官方文档管理：
 * - Subagents: .claude/agents/ 下的 Markdown 文件
 * - Agent Skills: .claude/skills/ 下的 SKILL.md 文件
 * - Slash Commands: 已有独立管理器
 */
export const ClaudeExtensionsManager: React.FC<ClaudeExtensionsManagerProps> = ({
  projectPath,
  className,
  onBack
}) => {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [agents, setAgents] = useState<AgentFile[]>([]);
  const [skills, setSkills] = useState<SkillFile[]>([]);
  const [activeTab, setActiveTab] = useState("plugins");
  const [loading, setLoading] = useState(false);

  // 加载插件
  const loadPlugins = async () => {
    try {
      setLoading(true);
      const result = await api.listPlugins(projectPath);
      setPlugins(result);
      console.log('[ClaudeExtensions] Loaded', result.length, 'plugins');
    } catch (error) {
      console.error('[ClaudeExtensions] Failed to load plugins:', error);
    } finally {
      setLoading(false);
    }
  };

  // 加载子代理
  const loadAgents = async () => {
    try {
      setLoading(true);
      const result = await api.listSubagents(projectPath);
      setAgents(result);
      console.log('[ClaudeExtensions] Loaded', result.length, 'subagents');
    } catch (error) {
      console.error('[ClaudeExtensions] Failed to load agents:', error);
    } finally {
      setLoading(false);
    }
  };

  // 加载 Agent Skills
  const loadSkills = async () => {
    try {
      setLoading(true);
      const result = await api.listAgentSkills(projectPath);
      setSkills(result);
      console.log('[ClaudeExtensions] Loaded', result.length, 'skills');
    } catch (error) {
      console.error('[ClaudeExtensions] Failed to load skills:', error);
    } finally {
      setLoading(false);
    }
  };

  // 打开目录
  const handleOpenPluginsDir = async () => {
    try {
      const dirPath = await api.openPluginsDirectory(projectPath);
      await api.openDirectoryInExplorer(dirPath);
    } catch (error) {
      console.error('Failed to open plugins directory:', error);
    }
  };

  const handleOpenAgentsDir = async () => {
    try {
      const dirPath = await api.openAgentsDirectory(projectPath);
      await api.openDirectoryInExplorer(dirPath);
    } catch (error) {
      console.error('Failed to open agents directory:', error);
    }
  };

  const handleOpenSkillsDir = async () => {
    try {
      const dirPath = await api.openSkillsDirectory(projectPath);
      await api.openDirectoryInExplorer(dirPath);
    } catch (error) {
      console.error('Failed to open skills directory:', error);
    }
  };

  useEffect(() => {
    loadPlugins();
    loadAgents();
    loadSkills();
  }, [projectPath]);

  return (
    <div className={cn("space-y-4", className)}>
      {/* 返回按钮 */}
      {onBack && (
        <div className="flex items-center gap-3 mb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={onBack}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            返回主页
          </Button>
          <div>
            <h2 className="text-lg font-semibold">Claude 扩展管理器</h2>
            <p className="text-sm text-muted-foreground">管理 Plugins、Subagents 和 Agent Skills</p>
          </div>
        </div>
      )}
      
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="plugins">
            <Package className="h-4 w-4 mr-2" />
            Plugins
          </TabsTrigger>
          <TabsTrigger value="agents">
            <Bot className="h-4 w-4 mr-2" />
            Subagents
          </TabsTrigger>
          <TabsTrigger value="skills">
            <Sparkles className="h-4 w-4 mr-2" />
            Skills
          </TabsTrigger>
        </TabsList>

        {/* Plugins Tab */}
        <TabsContent value="plugins" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Plugins</h3>
              <p className="text-sm text-muted-foreground">
                已安装的插件（可包含 commands、agents、skills、hooks、MCP servers）
              </p>
            </div>
          </div>

          {/* 插件列表 */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : plugins.length > 0 ? (
            <div className="space-y-2">
              {plugins.map((plugin) => (
                <Card key={plugin.path} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1">
                      <Package className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium">{plugin.name}</h4>
                          <Badge variant="outline" className="text-xs">
                            v{plugin.version}
                          </Badge>
                          {plugin.enabled && (
                            <Badge variant="default" className="text-xs bg-green-600">
                              已启用
                            </Badge>
                          )}
                        </div>
                        {plugin.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {plugin.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          {plugin.components.commands > 0 && <span>📝 {plugin.components.commands} 命令</span>}
                          {plugin.components.agents > 0 && <span>🤖 {plugin.components.agents} 代理</span>}
                          {plugin.components.skills > 0 && <span>✨ {plugin.components.skills} 技能</span>}
                          {plugin.components.hooks > 0 && <span>🪝 钩子</span>}
                          {plugin.components.mcpServers > 0 && <span>🔌 MCP</span>}
                        </div>
                        {plugin.author && (
                          <p className="text-xs text-muted-foreground mt-1">作者: {plugin.author}</p>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleOpenPluginsDir}
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-6 text-center border-dashed">
              <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h4 className="font-medium mb-2">暂无已安装的 Plugins</h4>
              <p className="text-sm text-muted-foreground mb-4">
                Plugins 存储在 .claude/plugins/ 目录下
              </p>
              <div className="text-xs text-muted-foreground mb-4">
                使用 <code className="bg-muted px-1 py-0.5 rounded">/plugin</code> 命令管理插件
              </div>
              <Button variant="outline" size="sm" onClick={handleOpenPluginsDir}>
                <FolderOpen className="h-4 w-4 mr-2" />
                打开目录
              </Button>
            </Card>
          )}
        </TabsContent>

        {/* Subagents Tab */}
        <TabsContent value="agents" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">子代理</h3>
              <p className="text-sm text-muted-foreground">
                存储在 <code className="text-xs bg-muted px-1 py-0.5 rounded">.claude/agents/</code> 的专用代理
              </p>
            </div>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              新建子代理
            </Button>
          </div>

          {/* 子代理列表 */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : agents.length > 0 ? (
            <div className="space-y-2">
              {agents.map((agent) => (
                <Card 
                  key={agent.path} 
                  className="p-4 cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => api.openFileWithDefaultApp(agent.path)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1">
                      <Bot className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium">{agent.name}</h4>
                          <Badge variant={agent.scope === 'project' ? 'default' : 'outline'} className="text-xs">
                            {agent.scope}
                          </Badge>
                        </div>
                        {agent.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {agent.description}
                          </p>
                        )}
                        <code className="text-xs text-muted-foreground mt-2 block truncate">
                          {agent.path}
                        </code>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
              
              {/* 打开目录按钮 */}
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={handleOpenAgentsDir}
              >
                <FolderOpen className="h-3.5 w-3.5 mr-2" />
                打开子代理目录
              </Button>
            </div>
          ) : (
            <Card className="p-6 text-center border-dashed">
              <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h4 className="font-medium mb-2">暂无子代理</h4>
              <p className="text-sm text-muted-foreground mb-4">
                子代理存储在 .claude/agents/ 目录下
              </p>
              <Button variant="outline" size="sm" onClick={handleOpenAgentsDir}>
                <FolderOpen className="h-4 w-4 mr-2" />
                打开目录
              </Button>
            </Card>
          )}
        </TabsContent>

        {/* Agent Skills Tab */}
        <TabsContent value="skills" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Agent Skills</h3>
              <p className="text-sm text-muted-foreground">
                存储在 <code className="text-xs bg-muted px-1 py-0.5 rounded">.claude/skills/</code> 的专用技能
              </p>
            </div>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              新建 Skill
            </Button>
          </div>

          {/* Agent Skills 列表 */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : skills.length > 0 ? (
            <div className="space-y-2">
              {skills.map((skill) => (
                <Card 
                  key={skill.path} 
                  className="p-4 cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => api.openFileWithDefaultApp(skill.path)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1">
                      <Sparkles className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium">{skill.name}</h4>
                          <Badge variant={skill.scope === 'project' ? 'default' : 'outline'} className="text-xs">
                            {skill.scope}
                          </Badge>
                        </div>
                        {skill.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {skill.description}
                          </p>
                        )}
                        <code className="text-xs text-muted-foreground mt-2 block truncate">
                          {skill.path}
                        </code>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
              
              {/* 打开目录按钮 */}
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={handleOpenSkillsDir}
              >
                <FolderOpen className="h-3.5 w-3.5 mr-2" />
                打开 Skills 目录
              </Button>
            </div>
          ) : (
            <Card className="p-6 text-center border-dashed">
              <Sparkles className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h4 className="font-medium mb-2">暂无 Agent Skills</h4>
              <p className="text-sm text-muted-foreground mb-4">
                Agent Skills 存储在 .claude/skills/ 目录下（文件名格式：NAME.SKILL.md）
              </p>
              <Button variant="outline" size="sm" onClick={handleOpenSkillsDir}>
                <FolderOpen className="h-4 w-4 mr-2" />
                打开目录
              </Button>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* 官方文档和资源链接 */}
      <div className="text-xs text-muted-foreground border-t pt-4 space-y-3">
        <div>
          <p className="mb-2 font-medium">📚 官方文档：</p>
          <ul className="space-y-1 ml-4">
            <li>• <a href="https://docs.claude.com/en/docs/claude-code/plugins" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Plugins 文档</a></li>
            <li>• <a href="https://docs.claude.com/en/docs/claude-code/subagents" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Subagents 文档</a></li>
            <li>• <a href="https://docs.claude.com/en/docs/claude-code/agent-skills" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Agent Skills 文档</a></li>
          </ul>
        </div>
        
        <div>
          <p className="mb-2 font-medium">🎯 官方资源：</p>
          <ul className="space-y-1 ml-4">
            <li>• <a href="https://github.com/anthropics/skills" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
              Anthropic Skills 仓库
              <span className="text-muted-foreground">(13.7k ⭐)</span>
            </a></li>
          </ul>
          <p className="text-muted-foreground mt-2 ml-4 text-[11px]">
            包含官方示例 Skills：文档处理、创意设计、开发工具等
          </p>
        </div>
      </div>
    </div>
  );
};

