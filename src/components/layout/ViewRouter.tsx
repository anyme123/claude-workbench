import React, { useState, useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence, Transition } from "framer-motion"; // ✨ Added for transitions
import { api, type Project } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ProjectList } from "@/components/ProjectList";
import { SessionList } from "@/components/SessionList";
import { RunningClaudeSessions } from "@/components/RunningClaudeSessions";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { ClaudeFileEditor } from "@/components/ClaudeFileEditor";
import { Settings } from "@/components/Settings";
import { ClaudeCodeSession } from "@/components/ClaudeCodeSession";
import { TabManager } from "@/components/TabManager";
import { UsageDashboard } from "@/components/UsageDashboard";
import { MCPManager } from "@/components/MCPManager";
import { ClaudeBinaryDialog } from "@/components/dialogs/ClaudeBinaryDialog";
import { Toast, ToastContainer } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProjectSettings } from '@/components/ProjectSettings';
import { EnhancedHooksManager } from '@/components/EnhancedHooksManager';
import { ClaudeExtensionsManager } from '@/components/ClaudeExtensionsManager';
import { ProjectCardSkeleton, SessionListItemSkeleton } from '@/components/ui/skeleton';
import { useNavigation } from '@/contexts/NavigationContext';
import { useProject } from '@/contexts/ProjectContext';
import { useTabs } from '@/hooks/useTabs';
import { useGlobalKeyboardShortcuts } from '@/hooks/useGlobalKeyboardShortcuts';

// ✨ View transition variants
const pageVariants = {
  initial: { opacity: 0, y: 10 },
  in: { opacity: 1, y: 0 },
  out: { opacity: 0, y: -10 }
};

const pageTransition: Transition = {
  type: "tween",
  ease: "anticipate",
  duration: 0.3
};

export const ViewRouter: React.FC = () => {
  const { t } = useTranslation();
  const { currentView, navigateTo, viewParams, setNavigationInterceptor, goBack } = useNavigation();
  const {
    projects, selectedProject, sessions, loading, error,
    loadProjects, selectProject, deleteProject, clearSelection, refreshSessions
  } = useProject();
  const { openSessionInBackground, switchToTab } = useTabs();

  const [showClaudeBinaryDialog, setShowClaudeBinaryDialog] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [showNavigationConfirm, setShowNavigationConfirm] = useState(false);
  const [pendingView, setPendingView] = useState<any | null>(null); // Store pending view for confirmation

  // Load projects on mount if in projects view
  const hasLoadedProjectsRef = useRef(false);
  useEffect(() => {
    if (currentView === "projects" && !hasLoadedProjectsRef.current) {
      loadProjects();
      hasLoadedProjectsRef.current = true;
    }
  }, [currentView, loadProjects]);

  // Global keyboard shortcuts
  useGlobalKeyboardShortcuts({
    onOpenSettings: () => {
      navigateTo('settings');
    },
    enabled: currentView !== 'claude-code-session',
  });

  // Listen for open-prompt-api-settings
  useEffect(() => {
    const handleOpenPromptAPISettings = () => {
      if (currentView !== "settings") {
        navigateTo("settings");
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('switch-to-prompt-api-tab'));
        }, 100);
      }
    };
    window.addEventListener('open-prompt-api-settings', handleOpenPromptAPISettings as EventListener);
    return () => window.removeEventListener('open-prompt-api-settings', handleOpenPromptAPISettings as EventListener);
  }, [currentView, navigateTo]);

  // Listen for claude-session-selected
  useEffect(() => {
    const handleSessionSelected = (event: CustomEvent) => {
      const { session } = event.detail;
      const result = openSessionInBackground(session);
      switchToTab(result.tabId);
      navigateTo("claude-tab-manager");

      if (result.isNew) {
        setToast({ message: `会话 ${session.id.slice(-8)} 已打开`, type: "success" });
      } else {
        setToast({ message: `已切换到会话 ${session.id.slice(-8)}`, type: "info" });
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
  }, [openSessionInBackground, switchToTab, navigateTo]);

  // Listen for claude-complete
  useEffect(() => {
    let unlistenComplete: UnlistenFn | null = null;
    const setupListener = async () => {
      unlistenComplete = await listen<boolean>('claude-complete', async (event) => {
        if (event.payload === true) {
          loadProjects(); // Refresh projects to update counts/timestamps
          if (selectedProject) {
            refreshSessions();
          }
        }
      });
    };
    setupListener();
    return () => {
      if (unlistenComplete) unlistenComplete();
    };
  }, [loadProjects, selectedProject, refreshSessions]);

  // Handlers
  const handleSessionDelete = async (sessionId: string, projectId: string) => {
    try {
      await api.deleteSession(sessionId, projectId);
      refreshSessions();
      setToast({ message: `会话已成功删除`, type: "success" });
    } catch (err) {
      console.error("Failed to delete session:", err);
      setToast({ message: `删除会话失败`, type: "error" });
    }
  };

  const handleSessionsBatchDelete = async (sessionIds: string[], projectId: string) => {
    try {
      await api.deleteSessionsBatch(sessionIds, projectId);
      refreshSessions();
      setToast({ message: `成功删除 ${sessionIds.length} 个会话`, type: "success" });
    } catch (err) {
      console.error("Failed to batch delete sessions:", err);
      setToast({ message: `批量删除会话失败`, type: "error" });
    }
  };

  const handleProjectDeleteWrapper = async (project: Project) => {
    try {
      await deleteProject(project);
      setToast({ message: `项目 "${project.path.split('/').pop()}" 已删除成功`, type: "success" });
    } catch (err) {
      setToast({ message: `删除项目失败: ${err}`, type: "error" });
    }
  };

  // Render Logic
  const renderContent = () => {
    switch (currentView) {
      case "enhanced-hooks-manager":
        return (
          <EnhancedHooksManager
            onBack={goBack}
            projectPath={viewParams.projectPath}
          />
        );

      case "claude-extensions":
        return (
          <div className="flex-1 overflow-y-auto">
            <div className="container mx-auto p-6">
              <ClaudeExtensionsManager
                projectPath={viewParams.projectPath}
                onBack={goBack}
              />
            </div>
          </div>
        );

      case "editor":
        return (
          <div className="flex-1 overflow-hidden">
            <MarkdownEditor onBack={goBack} />
          </div>
        );

      case "settings":
        return (
          <div className="flex-1 flex flex-col" style={{ minHeight: 0 }}>
            <Settings onBack={goBack} />
          </div>
        );

      case "projects":
        return (
          <div className="flex-1 overflow-y-auto">
            <div className="container mx-auto p-6">
              {!selectedProject && (
                <div className="mb-6 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h1 className="text-3xl font-bold tracking-tight">{t('common.ccProjectsTitle')}</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t('common.browseClaudeSessions')}
                    </p>
                  </div>
                  <Button
                    onClick={() => navigateTo("claude-tab-manager", { initialProjectPath: "__NEW_PROJECT__" })}
                    size="default"
                    className="flex-shrink-0"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {t('common.newProject')}
                  </Button>
                </div>
              )}

              {error && (
                <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive max-w-2xl">
                  {error}
                </div>
              )}

              {loading && (
                <>
                  {selectedProject ? (
                    <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
                      {[...Array(8)].map((_, i) => (
                        <SessionListItemSkeleton key={i} />
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
                      {[...Array(6)].map((_, i) => (
                        <ProjectCardSkeleton key={i} />
                      ))}
                    </div>
                  )}
                </>
              )}

              {!loading && (
                <>
                  {selectedProject ? (
                    <div>
                      <SessionList
                        sessions={sessions}
                        projectPath={selectedProject.path}
                        onBack={clearSelection}
                        onEditClaudeFile={(file) => navigateTo("claude-file-editor", { file })}
                        onSessionDelete={handleSessionDelete}
                        onSessionsBatchDelete={handleSessionsBatchDelete}
                        onSessionClick={(session) => {
                          const result = openSessionInBackground(session);
                          switchToTab(result.tabId);
                          navigateTo("claude-tab-manager");
                          if (result.isNew) {
                            setToast({ message: `会话 ${session.id.slice(-8)} 已打开`, type: "success" });
                          } else {
                            setToast({ message: `已切换到会话 ${session.id.slice(-8)}`, type: "info" });
                          }
                        }}
                        onNewSession={(projectPath) => {
                          navigateTo("claude-tab-manager", { initialProjectPath: projectPath });
                        }}
                      />
                    </div>
                  ) : (
                    <div>
                      <RunningClaudeSessions
                        onSessionClick={(session) => {
                          const result = openSessionInBackground(session);
                          switchToTab(result.tabId);
                          navigateTo("claude-tab-manager");
                          if (result.isNew) {
                            setToast({ message: `会话 ${session.id.slice(-8)} 已打开`, type: "success" });
                          } else {
                            setToast({ message: `已切换到会话 ${session.id.slice(-8)}`, type: "info" });
                          }
                        }}
                      />

                      {projects.length > 0 ? (
                        <ProjectList
                          projects={projects}
                          onProjectClick={selectProject}
                          onProjectSettings={(project) => navigateTo("project-settings", { project })}
                          onProjectDelete={handleProjectDeleteWrapper}
                          onProjectsChanged={loadProjects}
                          loading={loading}
                        />
                      ) : (
                        <div className="py-8 text-center">
                          <p className="text-sm text-muted-foreground">
                            {t('common.noProjectsFound')}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        );

      case "claude-file-editor":
        return viewParams.file ? (
          <ClaudeFileEditor
            file={viewParams.file}
            onBack={goBack}
          />
        ) : null;

      case "claude-code-session":
        return (
          <ClaudeCodeSession
            session={viewParams.initialSession}
            initialProjectPath={viewParams.initialProjectPath}
            onStreamingChange={(isStreaming) => {
              // Navigation protection
              if (isStreaming) {
                setNavigationInterceptor((nextView) => {
                  setPendingView(nextView);
                  setShowNavigationConfirm(true);
                  return false;
                });
              } else {
                setNavigationInterceptor(null);
              }
            }}
          />
        );

      case "claude-tab-manager":
        return (
          <TabManager
            initialSession={viewParams.initialSession}
            initialProjectPath={viewParams.initialProjectPath}
            onBack={() => navigateTo("projects")}
          />
        );

      case "usage-dashboard":
        return <UsageDashboard onBack={goBack} />;

      case "mcp":
        return <MCPManager onBack={goBack} />;

      case "project-settings":
        if (viewParams.project) {
          return (
            <ProjectSettings
              project={viewParams.project}
              onBack={goBack}
            />
          );
        }
        break;

      default:
        return null;
    }
  };

  return (
    <>
      {/* ✨ AnimatePresence for smooth page transitions */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={currentView}
          initial="initial"
          animate="in"
          exit="out"
          variants={pageVariants}
          transition={pageTransition}
          className="flex-1 flex flex-col h-full overflow-hidden"
        >
          {renderContent()}
        </motion.div>
      </AnimatePresence>

      <ClaudeBinaryDialog
        open={showClaudeBinaryDialog}
        onOpenChange={setShowClaudeBinaryDialog}
        onSuccess={() => {
          setToast({ message: t('messages.saved'), type: "success" });
          window.location.reload();
        }}
        onError={(message) => setToast({ message, type: "error" })}
      />

      <Dialog open={showNavigationConfirm} onOpenChange={setShowNavigationConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认离开</DialogTitle>
            <DialogDescription>
              Claude 正在处理您的请求。确定要离开当前会话吗？这将中断正在进行的对话。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowNavigationConfirm(false);
              setPendingView(null);
            }}>
              取消
            </Button>
            <Button onClick={() => {
              setNavigationInterceptor(null); // Clear interceptor to allow navigation
              setShowNavigationConfirm(false);
              if (pendingView) {
                navigateTo(pendingView);
              }
            }}>
              确定离开
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ToastContainer>
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onDismiss={() => setToast(null)}
          />
        )}
      </ToastContainer>
    </>
  );
};
