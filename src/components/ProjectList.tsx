import React, { useState } from "react";
import {
  FolderOpen,
  Calendar,
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
import { formatTimeAgo } from "@/lib/date-utils";
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
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {currentProjects.map((project) => (
          <div
            key={project.id}
            onClick={() => onProjectClick(project)}
            className="w-full text-left px-4 py-3 rounded-lg bg-card border border-transparent hover:border-border hover:bg-muted/30 transition-colors group cursor-pointer"
          >
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <FolderOpen className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                <h3 className="font-medium text-[15px] truncate">
                  {getProjectName(project.path)}
                </h3>
              </div>
              {project.sessions.length > 0 && (
                <span className="text-xs text-muted-foreground font-medium px-2 py-0.5 bg-muted/50 rounded shrink-0">
                  {project.sessions.length}
                </span>
              )}
            </div>

            <p className="text-sm text-muted-foreground truncate font-mono mb-2">
              {project.path}
            </p>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>{formatTimeAgo(project.created_at * 1000)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  <span>{project.sessions.length} 会话</span>
                </div>
              </div>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {(onProjectSettings || onProjectDelete) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon-sm" className="h-7 w-7">
                        <MoreVertical className="h-4 w-4" />
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
                          <Settings className="h-4 w-4 mr-2" />
                          Hooks
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
                          <Trash2 className="h-4 w-4 mr-2" />
                          删除项目
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          </div>
        ))}
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
