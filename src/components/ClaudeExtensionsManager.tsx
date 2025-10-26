import React, { useState, useEffect } from "react";
import {
  Bot,
  Code,
  FolderOpen,
  Plus,
  Package,
  Sparkles,
  Loader2
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
  className
}) => {
  const [agents, setAgents] = useState<AgentFile[]>([]);
  const [skills, setSkills] = useState<SkillFile[]>([]);
  const [activeTab, setActiveTab] = useState("agents");
  const [loading, setLoading] = useState(false);

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
  const handleOpenAgentsDir = async () => {
    try {
      const dirPath = await api.openAgentsDirectory(projectPath);
      const { open } = await import('@tauri-apps/plugin-shell');
      await open(dirPath);
    } catch (error) {
      console.error('Failed to open agents directory:', error);
    }
  };

  const handleOpenSkillsDir = async () => {
    try {
      const dirPath = await api.openSkillsDirectory(projectPath);
      const { open } = await import('@tauri-apps/plugin-shell');
      await open(dirPath);
    } catch (error) {
      console.error('Failed to open skills directory:', error);
    }
  };

  useEffect(() => {
    loadAgents();
    loadSkills();
  }, [projectPath]);

  return (
    <div className={cn("space-y-4", className)}>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="agents">
            <Bot className="h-4 w-4 mr-2" />
            子代理 (Subagents)
          </TabsTrigger>
          <TabsTrigger value="skills">
            <Sparkles className="h-4 w-4 mr-2" />
            Agent Skills
          </TabsTrigger>
        </TabsList>

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
                <Card key={agent.path} className="p-4">
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
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleOpenAgentsDir}
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
                <Card key={skill.path} className="p-4">
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
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleOpenSkillsDir}
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </Card>
              ))}
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

      {/* 链接到 Slash Commands */}
      <Card className="p-4 bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Code className="h-5 w-5 text-primary" />
            <div>
              <h4 className="font-medium">Slash Commands</h4>
              <p className="text-xs text-muted-foreground">
                自定义斜杠命令 - 已有独立管理器
              </p>
            </div>
          </div>
          <Badge variant="outline">已实现</Badge>
        </div>
      </Card>

      {/* 官方文档链接 */}
      <div className="text-xs text-muted-foreground border-t pt-4">
        <p className="mb-2">📚 官方文档参考：</p>
        <ul className="space-y-1 ml-4">
          <li>• <a href="https://docs.claude.com/en/docs/claude-code/subagents" target="_blank" className="text-primary hover:underline">Subagents 文档</a></li>
          <li>• <a href="https://docs.claude.com/en/docs/claude-code/agent-skills" target="_blank" className="text-primary hover:underline">Agent Skills 文档</a></li>
          <li>• <a href="https://docs.claude.com/en/docs/claude-code/slash-commands" target="_blank" className="text-primary hover:underline">Slash Commands 文档</a></li>
        </ul>
      </div>
    </div>
  );
};

