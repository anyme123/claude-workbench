import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Loader2, FolderCode } from "lucide-react";
import { api, type Project, type Session, type ClaudeMdFile } from "@/lib/api";
import { OutputCacheProvider } from "@/lib/outputCache";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProjectList } from "@/components/ProjectList";
import { SessionList } from "@/components/SessionList";
import { RunningClaudeSessions } from "@/components/RunningClaudeSessions";
import { Topbar } from "@/components/Topbar";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { ClaudeFileEditor } from "@/components/ClaudeFileEditor";
import { Settings } from "@/components/Settings";
import { ClaudeCodeSession } from "@/components/ClaudeCodeSession";
import { TabManager } from "@/components/TabManager";
import { TabProvider, useTabs } from "@/hooks/useTabs";
import { TabIndicator } from "@/components/TabIndicator";
import { UsageDashboard } from "@/components/UsageDashboard";
import { MCPManager } from "@/components/MCPManager";
import { ClaudeBinaryDialog } from "@/components/ClaudeBinaryDialog";
import { Toast, ToastContainer } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProjectSettings } from '@/components/ProjectSettings';
import { EnhancedHooksManager } from '@/components/EnhancedHooksManager';
import { useTranslation } from '@/hooks/useTranslation';

type View =
  | "welcome"
  | "projects"
  | "editor"
  | "claude-file-editor"
  | "claude-code-session"
  | "claude-tab-manager"
  | "settings"
  | "mcp"
  | "usage-dashboard"
  | "project-settings"
  | "enhanced-hooks-manager";

/**
 * 主应用组件 - 管理 Claude 目录浏览器界面
 * Main App component - Manages the Claude directory browser UI
 */
function App() {
  return (
    <TabProvider>
      <AppContent />
    </TabProvider>
  );
}

/**
 * 应用内容组件 - 在 TabProvider 内部访问标签页状态
 */
function AppContent() {
  const { t } = useTranslation();
  const { openSessionInBackground } = useTabs();
  const [view, setView] = useState<View>("welcome");
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [editingClaudeFile, setEditingClaudeFile] = useState<ClaudeMdFile | null>(null);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showClaudeBinaryDialog, setShowClaudeBinaryDialog] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [activeClaudeSessionId, setActiveClaudeSessionId] = useState<string | null>(null);
  const [isClaudeStreaming, setIsClaudeStreaming] = useState(false);
  const [projectForSettings, setProjectForSettings] = useState<Project | null>(null);
  const [previousView, setPreviousView] = useState<View>("welcome");
  const [showNavigationConfirm, setShowNavigationConfirm] = useState(false);
  const [pendingView, setPendingView] = useState<View | null>(null);
  const [newSessionProjectPath, setNewSessionProjectPath] = useState<string>("");

  // 🔧 NEW: Navigation history stack for smart back functionality
  const [navigationHistory, setNavigationHistory] = useState<View[]>(["welcome"]);

  // 在项目视图中挂载时加载项目
  // Load projects on mount when in projects view
  useEffect(() => {
    if (view === "projects") {
      loadProjects();
    } else if (view === "welcome") {
      // Reset loading state for welcome view
      setLoading(false);
    }
  }, [view]);

  // 监听 Claude 会话选择事件
  // Listen for Claude session selection events
  useEffect(() => {
    const handleSessionSelected = (event: CustomEvent) => {
      const { session } = event.detail;
      // 在后台打开会话，不跳转页面
      const result = openSessionInBackground(session);
      // 根据是否创建新标签页显示不同的通知
      if (result.isNew) {
        setToast({
          message: `会话 ${session.id.slice(-8)} 已在后台打开`,
          type: "info"
        });
      } else {
        setToast({
          message: `会话 ${session.id.slice(-8)} 已存在`,
          type: "info"
        });
      }
    };

    const handleClaudeNotFound = () => {
      setShowClaudeBinaryDialog(true);
    };

    window.addEventListener('claude-session-selected', handleSessionSelected as EventListener);
    window.addEventListener('claude-not-found', handleClaudeNotFound as EventListener);
    return () => {
      window.removeEventListener('claude-session-selected', handleSessionSelected as EventListener);
      window.removeEventListener('claude-not-found', handleClaudeNotFound as EventListener);
    };
  }, []);

  /**
   * 从 ~/.claude/projects 目录加载所有项目
   * Loads all projects from the ~/.claude/projects directory
   */
  const loadProjects = async () => {
    try {
      setLoading(true);
      setError(null);
      const projectList = await api.listProjects();
      setProjects(projectList);
    } catch (err) {
      console.error("Failed to load projects:", err);
      setError(t('common.loadingProjects'));
    } finally {
      setLoading(false);
    }
  };

  /**
   * 处理项目选择并加载其会话
   * Handles project selection and loads its sessions
   */
  const handleProjectClick = async (project: Project) => {
    try {
      setLoading(true);
      setError(null);
      const sessionList = await api.getProjectSessions(project.id);
      setSessions(sessionList);
      setSelectedProject(project);
    } catch (err) {
      console.error("Failed to load sessions:", err);
      setError(t('common.loadingSessions'));
    } finally {
      setLoading(false);
    }
  };

  /**
   * 在主页打开新项目会话（需要选择项目路径）
   * Opens a new project session from home page (requires project path selection)
   */
  const handleNewProject = async () => {
    handleViewChange("claude-tab-manager");
    setSelectedSession(null);
  };

  /**
   * Returns to project list view
   */
  const handleBack = () => {
    setSelectedProject(null);
    setSessions([]);
  };

  /**
   * Handles editing a CLAUDE.md file from a project
   */
  const handleEditClaudeFile = (file: ClaudeMdFile) => {
    setEditingClaudeFile(file);
    handleViewChange("claude-file-editor");
  };

  /**
   * Returns from CLAUDE.md file editor to projects view
   */
  const handleBackFromClaudeFileEditor = () => {
    setEditingClaudeFile(null);
    handleViewChange("projects");
  };

  /**
   * 🔧 IMPROVED: Smart navigation with history tracking
   * Handles view changes with navigation protection and history management
   */
  const handleViewChange = (newView: View) => {
    // Check if we're navigating away from an active Claude session
    if (view === "claude-code-session" && isClaudeStreaming && activeClaudeSessionId) {
      // Show in-app confirmation dialog instead of system confirm
      setPendingView(newView);
      setShowNavigationConfirm(true);
      return;
    }

    // 🔧 NEW: Add current view to history before navigating
    setNavigationHistory(prev => {
      // Avoid duplicate consecutive entries
      if (prev[prev.length - 1] !== view) {
        return [...prev, view];
      }
      return prev;
    });

    setPreviousView(view);
    setView(newView);
  };

  /**
   * 🔧 NEW: Smart back function that uses navigation history
   */
  const handleSmartBack = () => {
    if (navigationHistory.length > 1) {
      // Remove current view and get previous one
      const newHistory = [...navigationHistory];
      newHistory.pop(); // Remove current
      const previousView = newHistory[newHistory.length - 1];

      setNavigationHistory(newHistory);
      setView(previousView);
      return previousView;
    }
    // Fallback to welcome if no history
    setView("welcome");
    return "welcome";
  };

  /**
   * Handles navigation confirmation
   */
  const handleNavigationConfirm = () => {
    if (pendingView) {
      setView(pendingView);
      setPendingView(null);
    }
    setShowNavigationConfirm(false);
  };

  /**
   * Handles navigation cancellation
   */
  const handleNavigationCancel = () => {
    setPendingView(null);
    setShowNavigationConfirm(false);
  };

  /**
   * Handles navigating to hooks configuration
   */
  const handleProjectSettings = (project: Project) => {
    setProjectForSettings(project);
    handleViewChange("project-settings");
  };

  /**
   * 处理项目删除
   * Handles project deletion
   */
  const handleProjectDelete = async (project: Project) => {
    try {
      setLoading(true);
      await api.deleteProject(project.id);
      setToast({ message: `项目 "${project.path.split('/').pop()}" 已删除成功`, type: "success" });
      // 重新加载项目列表
      await loadProjects();
    } catch (err) {
      console.error("Failed to delete project:", err);
      setToast({ message: `删除项目失败: ${err}`, type: "error" });
      setLoading(false);
    }
  };

  /**
   * Handles navigating to hooks configuration from a project path
   */
  const handleProjectSettingsFromPath = (projectPath: string) => {
    // Create a temporary project object from the path
    const projectId = projectPath.replace(/[^a-zA-Z0-9]/g, '-');
    const tempProject: Project = {
      id: projectId,
      path: projectPath,
      sessions: [],
      created_at: Date.now() / 1000
    };
    setProjectForSettings(tempProject);
    setPreviousView(view);
    handleViewChange("project-settings");
  };

  const renderContent = () => {
    switch (view) {
      case "welcome":
        return (
          <div className="flex items-center justify-center p-8 min-h-full bg-gradient-to-br from-background via-background to-background/95">
            <div className="w-full max-w-6xl">
              {/* Welcome Header with Modern Gradient Text */}
              <motion.div
                initial={{ opacity: 0, y: -30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="mb-16 text-center"
              >
                <div className="mb-4 flex items-center justify-center gap-3">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                    className="text-6xl"
                  >
                    ◐
                  </motion.div>
                  <h1 className="text-5xl md:text-6xl font-bold tracking-tight bg-gradient-to-r from-foreground via-primary to-foreground bg-clip-text text-transparent">
                    {t('app.title')}
                  </h1>
                </div>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3, duration: 0.6 }}
                  className="text-xl text-muted-foreground mt-2"
                >
                  {t('app.subtitle')}
                </motion.p>
              </motion.div>

              {/* Navigation Card - Direct to Projects */}
              <div className="grid grid-cols-1 max-w-2xl mx-auto">
                {/* CC Projects Card */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ 
                    duration: 0.5, 
                    delay: 0.3,
                    ease: [0.22, 1, 0.36, 1]
                  }}
                >
                  <Card 
                    variant="interactive"
                    padding="none"
                    glow
                    className="h-72 overflow-hidden group"
                    onClick={() => handleViewChange("projects")}
                  >
                    <div className="h-full flex flex-col items-center justify-center p-10 relative">
                      {/* Background Gradient */}
                      <div className="absolute inset-0 bg-gradient-to-br from-accent/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      
                      {/* Icon with Floating Animation */}
                      <motion.div
                        animate={{ y: [0, -10, 0] }}
                        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                        className="relative z-10"
                      >
                        <div className="p-6 rounded-2xl bg-accent/10 group-hover:bg-accent/20 transition-colors duration-300">
                          <FolderCode className="h-20 w-20 text-accent-foreground" strokeWidth={1.5} />
                        </div>
                      </motion.div>

                      {/* Text */}
                      <div className="mt-6 relative z-10 text-center">
                        <h2 className="text-2xl font-bold mb-2 group-hover:text-accent-foreground transition-colors">
                          {t('navigation.ccProjects')}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                          Browse and manage your projects
                        </p>
                      </div>

                      {/* Decorative Elements */}
                      <div className="absolute top-4 right-4 w-20 h-20 bg-accent/5 rounded-full blur-2xl group-hover:bg-accent/10 transition-colors" />
                      <div className="absolute bottom-4 left-4 w-16 h-16 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-colors" />
                    </div>
                  </Card>
                </motion.div>
              </div>

              {/* Subtle Bottom Hint */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8, duration: 0.6 }}
                className="mt-12 text-center text-sm text-muted-foreground"
              >
                Click a card to get started
              </motion.div>
            </div>
          </div>
        );

      case "enhanced-hooks-manager":
        return (
          <EnhancedHooksManager
            onBack={handleSmartBack}
            projectPath={projectForSettings?.path}
          />
        );

      case "editor":
        return (
          <div className="flex-1 overflow-hidden">
            <MarkdownEditor onBack={handleSmartBack} />
          </div>
        );
      
      case "settings":
        return (
          <div className="flex-1 flex flex-col" style={{ minHeight: 0 }}>
            <Settings onBack={handleSmartBack} />
          </div>
        );
      
      case "projects":
        return (
          <div className="flex-1 overflow-y-auto">
            <div className="container mx-auto p-6">
              {/* Header with navigation - 🔧 IMPROVED: Reduce prominence of home button */}
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="mb-6"
              >
                <div className="mb-4">
                  <h1 className="text-3xl font-bold tracking-tight">{t('common.ccProjectsTitle')}</h1>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-sm text-muted-foreground">
                      {t('common.browseClaudeSessions')}
                    </p>
                    {/* 🔧 IMPROVED: 更清晰的返回主页按钮样式和位置 */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleViewChange("welcome")}
                      className="text-xs text-muted-foreground hover:text-foreground opacity-70 hover:opacity-100 transition-all duration-200"
                    >
                      ← 主页
                    </Button>
                  </div>
                </div>
              </motion.div>

              {/* Error display */}
              {error && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive max-w-2xl"
                >
                  {error}
                </motion.div>
              )}

              {/* Loading state */}
              {loading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}

              {/* Content */}
              {!loading && (
                <AnimatePresence mode="wait">
                  {selectedProject ? (
                    <motion.div
                      key="sessions"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.3 }}
                    >
                      <SessionList
                        sessions={sessions}
                        projectPath={selectedProject.path}
                        onBack={handleBack}
                        onEditClaudeFile={handleEditClaudeFile}
                        onSessionClick={(session) => {
                          // 在后台打开会话，不跳转页面
                          const result = openSessionInBackground(session);
                          if (result.isNew) {
                            setToast({
                              message: `会话 ${session.id.slice(-8)} 已在后台打开`,
                              type: "info"
                            });
                          } else {
                            setToast({
                              message: `会话 ${session.id.slice(-8)} 已存在`,
                              type: "info"
                            });
                          }
                        }}
                        onNewSession={(projectPath) => {
                          setSelectedSession(null); // Clear any existing session
                          setNewSessionProjectPath(projectPath); // Store the project path for new session
                          handleViewChange("claude-tab-manager");
                        }}
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="projects"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ duration: 0.3 }}
                    >
                      {/* New session button at the top */}
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                        className="mb-4"
                      >
                        <Button
                          onClick={handleNewProject}
                          size="default"
                          className="w-full max-w-md"
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          {t('common.newProject')}
                        </Button>
                      </motion.div>

                      {/* Running Claude Sessions */}
                      <RunningClaudeSessions
                        onSessionClick={(session) => {
                          // 在后台打开会话，不跳转页面
                          const result = openSessionInBackground(session);
                          if (result.isNew) {
                            setToast({
                              message: `会话 ${session.id.slice(-8)} 已在后台打开`,
                              type: "info"
                            });
                          } else {
                            setToast({
                              message: `会话 ${session.id.slice(-8)} 已存在`,
                              type: "info"
                            });
                          }
                        }}
                      />

                      {/* Project list */}
                      {projects.length > 0 ? (
                        <ProjectList
                          projects={projects}
                          onProjectClick={handleProjectClick}
                          onProjectSettings={handleProjectSettings}
                          onProjectDelete={handleProjectDelete}
                          onProjectsChanged={loadProjects}
                          loading={loading}
                          className="animate-fade-in"
                        />
                      ) : (
                        <div className="py-8 text-center">
                          <p className="text-sm text-muted-foreground">
                            {t('common.noProjectsFound')}
                          </p>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
            </div>
          </div>
        );
      
      case "claude-file-editor":
        return editingClaudeFile ? (
          <ClaudeFileEditor
            file={editingClaudeFile}
            onBack={handleBackFromClaudeFileEditor}
          />
        ) : null;
      
      case "claude-code-session":
        return (
          <ClaudeCodeSession
            session={selectedSession || undefined}
            initialProjectPath={newSessionProjectPath}
            onBack={() => {
              setSelectedSession(null);
              setNewSessionProjectPath(""); // Clear the project path
              handleViewChange("projects");
            }}
            onStreamingChange={(isStreaming, sessionId) => {
              setIsClaudeStreaming(isStreaming);
              setActiveClaudeSessionId(sessionId);
            }}
            onProjectSettings={handleProjectSettingsFromPath}
          />
        );

      case "claude-tab-manager":
        return (
          <TabManager
            initialSession={selectedSession || undefined}
            initialProjectPath={newSessionProjectPath}
            onBack={() => {
              setSelectedSession(null);
              setNewSessionProjectPath(""); // Clear the project path
              handleViewChange("projects");
            }}
            onProjectSettings={handleProjectSettingsFromPath}
          />
        );
      


      case "usage-dashboard":
        return (
          <UsageDashboard onBack={handleSmartBack} />
        );

      case "mcp":
        return (
          <MCPManager onBack={handleSmartBack} />
        );
      
      case "project-settings":
        if (projectForSettings) {
          return (
            <ProjectSettings
              project={projectForSettings}
              onBack={() => {
                setProjectForSettings(null);
                handleViewChange(previousView || "projects");
              }}
            />
          );
        }
        break;
      
      
      default:
        return null;
    }
  };

  return (
    <OutputCacheProvider>
      <div className="h-screen bg-background flex flex-col">
          {/* Topbar */}
          <Topbar
            onClaudeClick={() => handleViewChange("editor")}
            onSettingsClick={() => handleViewChange("settings")}
            onUsageClick={() => handleViewChange("usage-dashboard")}
            onMCPClick={() => handleViewChange("mcp")}
          />

          {/* 标签页指示器 */}
          <div className="flex-shrink-0 px-4 py-2 border-b bg-muted/20">
            <TabIndicator
              onViewTabs={() => handleViewChange("claude-tab-manager")}
            />
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto">
            {renderContent()}
          </div>

          {/* NFO Credits Modal */}

          {/* Claude Binary Dialog */}
          <ClaudeBinaryDialog
            open={showClaudeBinaryDialog}
            onOpenChange={setShowClaudeBinaryDialog}
            onSuccess={() => {
              setToast({ message: t('messages.saved'), type: "success" });
              // Trigger a refresh of the Claude version check
              window.location.reload();
            }}
            onError={(message) => setToast({ message, type: "error" })}
          />

          {/* Navigation Confirmation Dialog */}
          <Dialog open={showNavigationConfirm} onOpenChange={setShowNavigationConfirm}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>确认离开</DialogTitle>
                <DialogDescription>
                  Claude 正在处理您的请求。确定要离开当前会话吗？这将中断正在进行的对话。
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={handleNavigationCancel}>
                  取消
                </Button>
                <Button onClick={handleNavigationConfirm}>
                  确定离开
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Toast Container */}
          <ToastContainer>
            {toast && (
              <Toast
                message={toast.message}
                type={toast.type}
                onDismiss={() => setToast(null)}
              />
            )}
          </ToastContainer>
        </div>
      </OutputCacheProvider>
  );
}

export default App;
