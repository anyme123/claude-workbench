import React, { useState, useEffect } from "react";
import {
  FolderOpen,
  FileText,
  Settings,
  MoreVertical,
  Trash2,
  Archive,
  LayoutGrid,
  List
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { CodexSession } from "@/types/codex";
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
import { ProjectListSkeleton } from "@/components/skeletons/ProjectListSkeleton";
import { useTranslation } from "react-i18next";

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
  loading,
  className,
}) => {
  const { t } = useTranslation();
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState("active");
  const VIEW_MODE_STORAGE_KEY = "anycode.projects.viewMode";
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
      if (stored === "grid" || stored === "list") {
        return stored;
      }
    }
    return "grid";
  });
  const [codexSessions, setCodexSessions] = useState<CodexSession[]>([]);
  
  // Calculate pagination
  const totalPages = Math.ceil(projects.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentProjects = projects.slice(startIndex, endIndex);
  
  // Load Codex sessions for counting
  useEffect(() => {
    const loadCodexSessions = async () => {
      try {
        const sessions = await api.listCodexSessions();
        setCodexSessions(sessions);
      } catch (error) {
        console.error('Failed to load Codex sessions:', error);
        // Continue with empty array - won't block UI
      }
    };
    loadCodexSessions();
  }, []);

  // Reset to page 1 if projects change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [projects.length]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
    }
  }, [viewMode]);

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

  /**
   * Calculate total session count for a project (Claude Code + Codex)
   */
  const getTotalSessionCount = (project: Project): number => {
    // Claude Code sessions count
    const claudeSessionCount = project.sessions.length;

    // Codex sessions count - filter by normalized project path
    const normalize = (p: string) => p ? p.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase() : '';
    const projectPathNorm = normalize(project.path);

    const codexSessionCount = codexSessions.filter(cs => {
      const csPathNorm = normalize(cs.projectPath);
      return csPathNorm === projectPathNorm;
    }).length;

    return claudeSessionCount + codexSessionCount;
  };

  const ProjectGrid = () => {
    if (loading) {
      return <ProjectListSkeleton />;
    }

    return (
    <div className="space-y-4">
      <div className="flex justify-end mb-2">
        <div className="flex items-center bg-muted/50 rounded-lg p-1">
          <Button
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="icon-sm"
            onClick={() => setViewMode("grid")}
            className="h-7 w-7"
            title={t("projects.gridView")}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="icon-sm"
            onClick={() => setViewMode("list")}
            className="h-7 w-7"
            title={t("projects.listView")}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div
        className={cn(
          "grid gap-3",
          viewMode === "grid"
            ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
            : "grid-cols-1"
        )}
        role="list"
        aria-label="项目列表"
      >
        {currentProjects.map((project) => {
          const projectName = getProjectName(project.path);
          const sessionCount = getTotalSessionCount(project);
          const isCodexOnly = project.isCodexOnly;

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
              className={cn(
                "w-full text-left rounded-lg bg-card border border-border/40 hover:border-primary/50 hover:bg-muted/40 hover:shadow-md transition-all duration-200 group cursor-pointer relative",
                viewMode === "grid" ? "px-5 py-4" : "px-4 py-3 flex items-center gap-4"
              )}
              aria-label={`项目 ${projectName}，包含 ${sessionCount} 个会话，创建于 ${formatAbsoluteDateTime(project.created_at)}`}
            >
              {/* 主要信息区：项目图标 + 项目名称 */}
              <div className={cn("flex items-start gap-3", viewMode === "grid" ? "mb-2" : "flex-1 items-center mb-0")}>
                <div className="p-2 rounded-md bg-primary/10 text-primary shrink-0">
                  <FolderOpen className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className={cn("min-w-0", viewMode === "grid" ? "flex-1 pr-20" : "flex-1")}>
                  <h3 className="font-semibold text-base truncate text-foreground group-hover:text-primary transition-colors">
                    {projectName}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {viewMode === "grid" ? formatAbsoluteDateTime(project.created_at) : project.path}
                  </p>
                </div>
              </div>

              {/* 路径信息 (仅网格视图) */}
              {viewMode === "grid" && (
                <p
                  className="text-xs text-muted-foreground truncate font-mono"
                  aria-label={`路径: ${project.path}`}
                  title={project.path}
                >
                  {project.path}
                </p>
              )}

              {/* 右上角：会话数徽章 + 操作菜单 */}
              <div className={cn(
                "flex items-center gap-2",
                viewMode === "grid" ? "absolute top-4 right-4" : ""
              )}>
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

                {viewMode === "list" && (
                  <div className="text-xs text-muted-foreground hidden md:block w-32 text-right">
                    {formatAbsoluteDateTime(project.created_at)}
                  </div>
                )}

                {/* 操作菜单 */}
                {(((onProjectSettings && !isCodexOnly) || onProjectDelete)) && (
                  <div className={cn(
                    "transition-opacity",
                    viewMode === "grid" ? "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100" : "opacity-100"
                  )}>
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
                        {onProjectSettings && !isCodexOnly && (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              onProjectSettings(project);
                            }}
                          >
                            <Settings className="h-4 w-4 mr-2" aria-hidden="true" />
                            {t("projects.hooksConfig")}
                          </DropdownMenuItem>
                        )}
                        {onProjectSettings && !isCodexOnly && onProjectDelete && (
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
                            {t(project.isCodexOnly ? "projects.removeProject" : "projects.deleteProject")}
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
  };

  return (
    <div className={cn("space-y-4", className)}>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="active" className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4" />
            {t("projects.activeTab")}
          </TabsTrigger>
          <TabsTrigger value="deleted" className="flex items-center gap-2">
            <Archive className="h-4 w-4" />
            {t("projects.deletedTab")}
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
            <DialogTitle>
              {projectToDelete?.isCodexOnly
                ? t("projects.confirmRemoveTitle")
                : t("projects.confirmDeleteTitle")}
            </DialogTitle>
            <DialogDescription>
              {projectToDelete
                ? t(
                    projectToDelete.isCodexOnly
                      ? "projects.confirmRemoveDescription"
                      : "projects.confirmDeleteDescription",
                    { project: getProjectName(projectToDelete.path) }
                  )
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={cancelDelete}
              disabled={isDeleting}
            >
              {t("buttons.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={isDeleting}
            >
              {isDeleting
                ? t("messages.processing")
                : t(projectToDelete?.isCodexOnly ? "projects.removeProject" : "projects.deleteProject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}; 
