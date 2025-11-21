import React from "react";
import { motion } from "framer-motion";
import { FolderOpen, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type Project } from "@/lib/api";

interface ProjectSelectorProps {
  projectPath: string;
  setProjectPath: (path: string) => void;
  handleSelectPath: () => void;
  recentProjects: Project[];
  isLoading: boolean;
  setError: (error: string | null) => void;
}

export const ProjectSelector: React.FC<ProjectSelectorProps> = ({
  projectPath,
  setProjectPath,
  handleSelectPath,
  recentProjects,
  isLoading,
  setError,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="p-6 border-b border-border flex-shrink-0 bg-muted/20"
    >
      {/* Header section */}
      <div className="max-w-3xl mx-auto space-y-4">
        {!projectPath && (
          <div className="text-center mb-6">
            <FolderOpen className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">选择项目目录</h3>
            <p className="text-sm text-muted-foreground">
              请选择一个项目目录来开始新的 Claude 会话
            </p>
          </div>
        )}

        {/* Project path input */}
        <div className="space-y-2">
          <Label htmlFor="project-path" className="text-sm font-medium">
            项目路径
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id="project-path"
              value={projectPath}
              onChange={(e) => setProjectPath(e.target.value)}
              placeholder="输入项目路径或点击浏览按钮选择"
              className="flex-1"
              disabled={isLoading}
            />
            <Button
              onClick={handleSelectPath}
              variant="outline"
              disabled={isLoading}
              className="gap-2"
            >
              <FolderOpen className="h-4 w-4" />
              浏览
            </Button>
          </div>
        </div>

        {/* Recent projects list */}
        {!projectPath && recentProjects.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>最近使用的项目</span>
            </div>
            <div className="grid gap-2">
              {recentProjects.map((project) => (
                <Button
                  key={project.id}
                  variant="outline"
                  className="justify-start h-auto py-3 px-4"
                  onClick={() => {
                    setProjectPath(project.path);
                    setError(null);
                  }}
                >
                  <div className="flex flex-col items-start gap-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2 w-full">
                      <FolderOpen className="h-4 w-4 flex-shrink-0 text-primary" />
                      <span className="font-medium text-sm truncate">
                        {project.path.split('/').pop() || project.path.split('\\').pop()}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground truncate w-full">
                      {project.path}
                    </span>
                  </div>
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};
