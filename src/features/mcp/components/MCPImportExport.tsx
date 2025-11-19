import React, { useState } from "react";
import { Download, Upload, FileText, Loader2, Info, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { SelectComponent } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";

interface MCPImportExportProps {
  /**
   * Callback when import is completed
   */
  onImportCompleted: (imported: number, failed: number) => void;
  /**
   * Callback for error messages
   */
  onError: (message: string) => void;
}

/**
 * Component for importing and exporting MCP server configurations
 */
export const MCPImportExport: React.FC<MCPImportExportProps> = ({
  onImportCompleted,
  onError,
}) => {
  const [importingJson, setImportingJson] = useState(false);
  const [importingText, setImportingText] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [importScope, setImportScope] = useState("user");

  /**
   * Handles text input import
   */
  const handleImportFromText = async () => {
    if (!textInput.trim()) return;

    try {
      setImportingText(true);
      
      // Parse the JSON to validate it
      let jsonData;
      try {
        jsonData = JSON.parse(textInput);
      } catch (e) {
        onError("无效的 JSON 格式。请检查输入格式。");
        return;
      }

      // Check if it's a single server or multiple servers
      if (jsonData.mcpServers) {
        // Multiple servers format
        let imported = 0;
        let failed = 0;

        for (const [name, config] of Object.entries(jsonData.mcpServers)) {
          try {
            const serverConfig = {
              type: "stdio",
              command: (config as any).command,
              args: (config as any).args || [],
              env: (config as any).env || {}
            };
            
            const result = await api.mcpAddJson(name, JSON.stringify(serverConfig), importScope);
            if (result.success) {
              imported++;
            } else {
              failed++;
            }
          } catch (e) {
            failed++;
          }
        }
        
        onImportCompleted(imported, failed);
      } else if (jsonData.type && jsonData.command) {
        // Single server format
        const name = prompt("请输入此服务器的名称：");
        if (!name) return;

        const result = await api.mcpAddJson(name, textInput, importScope);
        if (result.success) {
          onImportCompleted(1, 0);
        } else {
          onError(result.message);
        }
      } else {
        onError("无法识别的 JSON 格式。需要 MCP 服务器配置格式。");
      }
      
      // Clear text input on successful import
      setTextInput("");
    } catch (error) {
      console.error("Failed to import from text:", error);
      onError("导入文本失败");
    } finally {
      setImportingText(false);
    }
  };

  /**
   * Handles JSON file import
   */
  const handleJsonFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setImportingJson(true);
      const content = await file.text();
      
      // Parse the JSON to validate it
      let jsonData;
      try {
        jsonData = JSON.parse(content);
      } catch (e) {
        onError("无效的 JSON 文件。请检查格式。");
        return;
      }

      // Check if it's a single server or multiple servers
      if (jsonData.mcpServers) {
        // Multiple servers format
        let imported = 0;
        let failed = 0;

        for (const [name, config] of Object.entries(jsonData.mcpServers)) {
          try {
            const serverConfig = {
              type: "stdio",
              command: (config as any).command,
              args: (config as any).args || [],
              env: (config as any).env || {}
            };
            
            const result = await api.mcpAddJson(name, JSON.stringify(serverConfig), importScope);
            if (result.success) {
              imported++;
            } else {
              failed++;
            }
          } catch (e) {
            failed++;
          }
        }
        
        onImportCompleted(imported, failed);
      } else if (jsonData.type && jsonData.command) {
        // Single server format
        const name = prompt("请输入此服务器的名称：");
        if (!name) return;

        const result = await api.mcpAddJson(name, content, importScope);
        if (result.success) {
          onImportCompleted(1, 0);
        } else {
          onError(result.message);
        }
      } else {
        onError("无法识别的 JSON 格式。需要 MCP 服务器配置格式。");
      }
    } catch (error) {
      console.error("Failed to import JSON:", error);
      onError("导入 JSON 文件失败");
    } finally {
      setImportingJson(false);
      // Reset the input
      event.target.value = "";
    }
  };

  /**
   * Handles exporting servers
   */
  const handleExport = async () => {
    try {
      // Get the configuration from .claude.json
      const exportData = await api.mcpExportConfig();
      
      // Create a blob and download it
      const blob = new Blob([exportData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      // Create download link
      const link = document.createElement('a');
      link.href = url;
      link.download = `mcp-servers-config-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up
      URL.revokeObjectURL(url);
      
      onError("✅ MCP服务器配置导出成功！文件已保存到下载文件夹。");
    } catch (error: any) {
      console.error("Failed to export MCP configuration:", error);
      onError(`导出MCP配置失败: ${error.toString()}`);
    }
  };


  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-base font-semibold">导入和导出</h3>
        <p className="text-sm text-muted-foreground mt-1">
          从其他来源导入 MCP 服务器配置或导出您的配置
        </p>
      </div>

      <div className="space-y-4">
        {/* Import Scope Selection */}
        <Card className="p-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <Settings2 className="h-4 w-4 text-slate-500" />
              <Label className="text-sm font-medium">导入范围</Label>
            </div>
            <SelectComponent
              value={importScope}
              onValueChange={(value: string) => setImportScope(value)}
              options={[
                { value: "local", label: "本地 (仅此项目)" },
                { value: "project", label: "项目 (通过 .mcp.json 共享)" },
                { value: "user", label: "用户 (所有项目)" },
              ]}
            />
            <p className="text-xs text-muted-foreground">
              选择从 JSON 文件导入的服务器的保存位置
            </p>
          </div>
        </Card>

        {/* Import from Text Input */}
        <Card className="p-4 hover:bg-accent/5 transition-colors">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-blue-500/10 rounded-lg">
                <Download className="h-5 w-5 text-blue-500" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-medium">从文本输入导入</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  粘贴 MCP 服务器配置 JSON 文本进行批量导入
                </p>
              </div>
            </div>
            <div className="space-y-3">
              <textarea
                placeholder="粘贴 MCP 服务器配置 JSON..."
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                disabled={importingText}
                className="w-full min-h-[120px] px-3 py-2 border rounded-md resize-vertical font-mono text-sm"
              />
              <Button
                onClick={handleImportFromText}
                disabled={importingText || !textInput.trim()}
                className="w-full gap-2 bg-primary hover:bg-primary/90"
              >
                {importingText ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    导入中...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    从文本导入
                  </>
                )}
              </Button>
            </div>
          </div>
        </Card>

        {/* Import from JSON */}
        <Card className="p-4 hover:bg-accent/5 transition-colors">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-purple-500/10 rounded-lg">
                <FileText className="h-5 w-5 text-purple-500" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-medium">从 JSON 导入</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  从 JSON 文件导入服务器配置
                </p>
              </div>
            </div>
            <div>
              <input
                type="file"
                accept=".json"
                onChange={handleJsonFileSelect}
                disabled={importingJson}
                className="hidden"
                id="json-file-input"
              />
              <Button
                onClick={() => document.getElementById("json-file-input")?.click()}
                disabled={importingJson}
                className="w-full gap-2"
                variant="outline"
              >
                {importingJson ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    导入中...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4" />
                    选择 JSON 文件
                  </>
                )}
              </Button>
            </div>
          </div>
        </Card>

        {/* Export Configuration */}
        <Card className="p-4 hover:bg-accent/5 transition-colors">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-orange-500/10 rounded-lg">
                <Upload className="h-5 w-5 text-orange-500" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-medium">导出配置</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  导出您的 MCP 服务器配置为 JSON 文件
                </p>
              </div>
            </div>
            <Button
              onClick={handleExport}
              variant="outline"
              className="w-full gap-2"
            >
              <Upload className="h-4 w-4" />
              导出配置
            </Button>
          </div>
        </Card>

      </div>

      {/* Format Examples */}
      <Card className="p-6 bg-muted/30">
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-base font-semibold">
            <Info className="h-5 w-5 text-primary" />
            <span>支持的 JSON 格式</span>
          </div>
          
          <div className="grid gap-6">
            {/* Claude Desktop Format */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <h4 className="font-semibold text-sm">Claude Desktop 格式</h4>
                <Badge variant="secondary" className="text-xs">推荐</Badge>
              </div>
              <pre className="bg-background p-4 rounded-lg overflow-x-auto text-xs border">
{`{
  "mcpServers": {
    "filesystem": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "@modelcontextprotocol/server-filesystem", "C:\\\\path\\\\to\\\\allowed-dir"],
      "env": {}
    },
    "context7": {
      "command": "cmd", 
      "args": ["/c", "npx", "-y", "@upstash/context7-mcp@latest"],
      "env": {}
    },
    "brave-search": {
      "command": "uvx",
      "args": ["mcp-server-brave-search"],
      "env": {
        "BRAVE_SEARCH_API_KEY": "your-api-key"
      }
    }
  }
}`}
              </pre>
            </div>
            
            {/* Single Server Format */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <h4 className="font-semibold text-sm">单个服务器格式</h4>
              </div>
              <pre className="bg-background p-4 rounded-lg overflow-x-auto text-xs border">
{`{
  "type": "stdio",
  "command": "cmd",
  "args": ["/c", "npx", "-y", "mcp-server-git", "--repository", "C:\\\\path\\\\to\\\\repo"],
  "env": {
    "GIT_AUTHOR_NAME": "Your Name"
  }
}`}
              </pre>
            </div>
          </div>
          
          <div className="bg-blue-50 dark:bg-blue-950/30 p-4 rounded-lg border-l-4 border-blue-500">
            <div className="flex items-start gap-3">
              <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <div className="space-y-2 text-sm">
                <p className="font-medium text-blue-700 dark:text-blue-300">使用提示：</p>
                <ul className="space-y-1 text-blue-600 dark:text-blue-400 text-xs">
                  <li>• <strong>Claude Desktop 格式</strong>：支持批量导入多个服务器</li>
                  <li>• <strong>单个服务器格式</strong>：导入时需要手动输入服务器名称</li>
                  <li>• <strong>Windows 系统</strong>：npx 需要通过 <code>cmd /c</code> 调用，uvx 可直接调用</li>
                  <li>• <strong>路径格式</strong>：Windows 路径需要使用双反斜杠转义（如 <code>C:\\\\path</code>）</li>
                  <li>• <strong>环境变量</strong>：可选，用于配置 API 密钥等敏感信息</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}; 