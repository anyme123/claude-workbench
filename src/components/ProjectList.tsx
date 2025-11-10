import React, { useState } from "react";
import {
  FolderOpen,
  FileText,
  Settings,
  MoreVertical,
  Trash2,
  Archive
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Project } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatAbsoluteDateTime } from "@/lib/date-utils";
import { Pagination } from "@/components/ui/pagination";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DeletedProjects } from "./DeletedProjects";

interface ProjectListProps {
  /**
   * Array of projects to display
   */
  projects: Project[];
  /**
   * Callback when a project is clicked
   */
  onProjectClick: (project: Project) => void;
  /**
   * Callback when hooks configuration is clicked
   */
  onProjectSettings?: (project: Project) => void;
  /**
   * Callback when a project is deleted
   */
  onProjectDelete?: (project: Project) => Promise<void>;
  /**
   * Callback when projects are changed (for refresh)
   */
  onProjectsChanged?: () => void;
  /**
   * Whether the list is currently loading
   */
  loading?: boolean;
  /**
   * Optional className for styling
   */
  className?: string;
}

const ITEMS_PER_PAGE = 12;

/**
 * Extracts the project name from the full path
 * Handles both Windows (\) and Unix (/) path separators
 */
const getProjectName = (path: string): string => {
  if (!path) return 'Unknown Project';
  
  // Normalize path separators and split
  const normalizedPath = path.replace(/\\/g, '/');
  const parts = normalizedPath.split('/').filter(Boolean);
  
  // Get the last non-empty part (directory name)
  const projectName = parts[parts.length - 1];
  
  // Fallback to the original path if we can't extract a name
  return projectName || path;
};

/**
 * ProjectList component - Displays a paginated list of projects with hover animations
 * 
 * @example
 * <ProjectList
 *   projects={projects}
 *   onProjectClick={(project) => console.log('Selected:', project)}
 * />
 */
export const ProjectList: React.FC<ProjectListProps> = ({
  projects,
  onProjectClick,
  onProjectSettings,
  onProjectDelete,
  onProjectsChanged,
  className,
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState("active");
  
  // Calculate pagination
  const totalPages = Math.ceil(projects.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentProjects = projects.slice(startIndex, endIndex);
  
  // Reset to page 1 if projects change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [projects.length]);

  const handleDeleteProject = (project: Project) => {
    setProjectToDelete(project);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!projectToDelete || !onProjectDelete) return;
    
    setIsDeleting(true);
    try {
      await onProjectDelete(projectToDelete);
      setDeleteDialogOpen(false);
      setProjectToDelete(null);
    } catch (error) {
      console.error('Failed to delete project:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const cancelDelete = () => {
    setDeleteDialogOpen(false);
    setProjectToDelete(null);
  };
  
  const ProjectGrid = () => (
    <div className="space-y-4">
      <div
        className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3"
        role="list"
        aria-label="项目列表"
      >
        {currentProjects.map((project) => {
          const projectName = getProjectName(project.path);
          const sessionCount = project.sessions.length;

          return (
            <div
              key={project.id}
              role="listitem"
              tabIndex={0}
              onClick={() => onProjectClick(project)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onProjectClick(project);
                }
              }}
              className="w-full text-left px-5 py-4 rounded-lg bg-card border border-border/40 hover:border-primary/50 hover:bg-muted/40 hover:shadow-md transition-all duration-200 group cursor-pointer relative"
              aria-label={`项目 ${projectName}，包含 ${sessionCount} 个会话，创建于 ${formatAbsoluteDateTime(project.created_at)}`}
            >
              {/* 主要信息区：项目图标 + 项目名称 */}
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-md bg-primary/10 text-primary shrink-0">
                  <FolderOpen className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0 pr-20">
                  <h3 className="font-semibold text-base truncate text-foreground group-hover:text-primary transition-colors">
                    {projectName}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatAbsoluteDateTime(project.created_at)}
                  </p>
                  {/* 路径信息移到名称下方 */}
                  <p
                    className="text-xs text-muted-foreground truncate font-mono mt-2"
                    aria-label={`路径: ${project.path}`}
                    title={project.path}
                  >
                    {project.path}
                  </p>
                </div>
              </div>

              {/* 右上角：会话数徽章 + 操作菜单 */}
              <div className="absolute top-4 right-4 flex items-center gap-2">
                {/* 会话数徽章 */}
                {sessionCount > 0 && (
                  <div
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 text-primary rounded-full"
                    aria-label={`${sessionCount} 个会话`}
                  >
                    <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="text-sm font-medium">{sessionCount}</span>
                  </div>
                )}

                {/* 操作菜单 */}
                {(onProjectSettings || onProjectDelete) && (
                  <div className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="h-8 w-8 hover:bg-muted"
                          aria-label={`${projectName} 项目操作菜单`}
                        >
                          <MoreVertical className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {onProjectSettings && (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              onProjectSettings(project);
                            }}
                          >
                            <Settings className="h-4 w-4 mr-2" aria-hidden="true" />
                            Hooks 配置
                          </DropdownMenuItem>
                        )}
                        {onProjectSettings && onProjectDelete && (
                          <DropdownMenuSeparator />
                        )}
                        {onProjectDelete && (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteProject(project);
                            }}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" aria-hidden="true" />
                            删除项目
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
      />
    </div>
  );

  return (
    <div className={cn("space-y-4", className)}>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="active" className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4" />
            活跃项目
          </TabsTrigger>
          <TabsTrigger value="deleted" className="flex items-center gap-2">
            <Archive className="h-4 w-4" />
            已删除项目
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="active" className="mt-6">
          <ProjectGrid />
        </TabsContent>
        
        <TabsContent value="deleted" className="mt-6">
          <DeletedProjects onProjectRestored={onProjectsChanged} />
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除项目</DialogTitle>
            <DialogDescription>
              您确定要删除项目 "{projectToDelete ? getProjectName(projectToDelete.path) : ""}" 吗？
              这将删除所有相关的会话数据和Todo文件，此操作无法撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={cancelDelete}
              disabled={isDeleting}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "删除中..." : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}; 
