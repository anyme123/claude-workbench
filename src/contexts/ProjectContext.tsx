import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { api, Project, Session } from '@/lib/api';
import { useTranslation } from 'react-i18next';
import type { CodexSession } from '@/types/codex';

interface ProjectContextType {
  projects: Project[];
  selectedProject: Project | null;
  sessions: Session[];
  loading: boolean;
  error: string | null;
  loadProjects: () => Promise<void>;
  selectProject: (project: Project) => Promise<void>;
  refreshSessions: () => Promise<void>;
  deleteProject: (project: Project) => Promise<void>;
  clearSelection: () => void;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

const normalizeProjectPath = (path?: string) => {
  if (!path) return '';
  return path.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
};

const hashProjectPath = (path: string) => {
  let hash = 0;
  for (let i = 0; i < path.length; i += 1) {
    hash = (hash * 31 + path.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
};

const CODEX_HIDDEN_STORAGE_KEY = "anycode.projects.hiddenCodex";

const getHiddenCodexProjects = (): string[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CODEX_HIDDEN_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveHiddenCodexProjects = (paths: string[]) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CODEX_HIDDEN_STORAGE_KEY, JSON.stringify(paths));
  } catch (error) {
    console.warn("Failed to persist hidden Codex projects:", error);
  }
};

const hideCodexOnlyProject = (path: string) => {
  const normalized = normalizeProjectPath(path);
  if (!normalized) return;
  const hidden = getHiddenCodexProjects();
  if (!hidden.includes(normalized)) {
    hidden.push(normalized);
    saveHiddenCodexProjects(hidden);
  }
};

export const ProjectProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [claudeProjects, codexSessions] = await Promise.all([
        api.listProjects(),
        api.listCodexSessions().catch((err) => {
          console.warn("Failed to load Codex sessions for project list:", err);
          return [] as CodexSession[];
        })
      ]);

      const projectMap = new Map<string, Project>();
      claudeProjects.forEach((project) => {
        projectMap.set(normalizeProjectPath(project.path), { ...project });
      });

      const codexByPath = new Map<string, { path: string; latest: number; count: number }>();
      const hiddenCodexSet = new Set(getHiddenCodexProjects());
      codexSessions.forEach((session) => {
        const normalizedPath = normalizeProjectPath(session.projectPath);
        if (!normalizedPath) return;
        if (hiddenCodexSet.has(normalizedPath)) {
          return;
        }
        const latest = session.updatedAt || session.createdAt || 0;
        const existing = codexByPath.get(normalizedPath);
        if (existing) {
          existing.count += 1;
          if (latest > existing.latest) existing.latest = latest;
        } else {
          codexByPath.set(normalizedPath, {
            path: session.projectPath,
            latest,
            count: 1,
          });
        }
      });

      const codexOnlyProjects: Project[] = [];
      codexByPath.forEach((info, normalizedPath) => {
        const existingProject = projectMap.get(normalizedPath);
        if (existingProject) {
          existingProject.codexSessionCount = info.count;
          if (info.latest > existingProject.created_at) {
            existingProject.created_at = info.latest;
          }
        } else {
          codexOnlyProjects.push({
            id: `codex-only::${hashProjectPath(normalizedPath || info.path)}`,
            path: info.path,
            sessions: [],
            created_at: info.latest || Math.floor(Date.now() / 1000),
            isCodexOnly: true,
            codexSessionCount: info.count,
          });
        }
      });

      const mergedProjects = [...projectMap.values(), ...codexOnlyProjects];
      mergedProjects.sort((a, b) => b.created_at - a.created_at);
      setProjects(mergedProjects);
    } catch (err) {
      console.error("Failed to load projects:", err);
      setError(t('common.loadingProjects'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const selectProject = useCallback(async (project: Project) => {
    try {
      setLoading(true);
      setError(null);
      const sessionList = await api.getProjectSessions(project.id, project.path);
      console.log('[ProjectContext] Loaded sessions:', sessionList.length);
      console.log('[ProjectContext] Session engines:', {
        claude: sessionList.filter(s => s.engine === 'claude').length,
        codex: sessionList.filter(s => s.engine === 'codex').length,
        undefined: sessionList.filter(s => !s.engine).length,
      });
      console.log('[ProjectContext] First Codex session:', sessionList.find(s => s.engine === 'codex'));
      setSessions(sessionList);
      setSelectedProject(project);
      
      // Background indexing
      api.preindexProject(project.path).catch(console.error);
    } catch (err) {
      console.error("Failed to load sessions:", err);
      setError(t('common.loadingSessions'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const refreshSessions = useCallback(async () => {
    if (selectedProject) {
      try {
        const sessionList = await api.getProjectSessions(selectedProject.id, selectedProject.path);
        setSessions(sessionList);
      } catch (err) {
        console.error("Failed to refresh sessions:", err);
      }
    }
  }, [selectedProject]);

  const deleteProject = useCallback(async (project: Project) => {
    try {
      setLoading(true);
      if (project.isCodexOnly) {
        hideCodexOnlyProject(project.path);
      } else {
        await api.deleteProject(project.id);
      }
      await loadProjects();
      if (selectedProject?.id === project.id) {
        setSelectedProject(null);
        setSessions([]);
      }
    } catch (err) {
      console.error("Failed to delete project:", err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [loadProjects, selectedProject]);

  const clearSelection = useCallback(() => {
    setSelectedProject(null);
    setSessions([]);
  }, []);

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  return (
    <ProjectContext.Provider value={{
      projects,
      selectedProject,
      sessions,
      loading,
      error,
      loadProjects,
      selectProject,
      refreshSessions,
      deleteProject,
      clearSelection
    }}>
      {children}
    </ProjectContext.Provider>
  );
};

export const useProject = () => {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
};
