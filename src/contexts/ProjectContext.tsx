import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { api, Project, Session } from '@/lib/api';
import { useTranslation } from 'react-i18next';

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
      const list = await api.listProjects();
      setProjects(list);
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

      // Load Claude/Codex sessions
      const claudeCodexSessions = await api.getProjectSessions(project.id, project.path);

      // Load Gemini sessions
      let geminiSessions: Session[] = [];
      try {
        const geminiSessionInfos = await api.listGeminiSessions(project.path);

        // Convert GeminiSessionInfo to Session format
        geminiSessions = geminiSessionInfos.map(info => ({
          id: info.sessionId,
          project_id: project.id,
          project_path: project.path,
          created_at: new Date(info.startTime).getTime() / 1000, // Convert to Unix timestamp
          first_message: info.firstMessage,
          message_timestamp: info.startTime,
          last_message_timestamp: info.startTime,
          engine: 'gemini' as const,
        }));
      } catch (geminiErr) {
        console.warn('[ProjectContext] Failed to load Gemini sessions (may not exist):', geminiErr);
        // Continue without Gemini sessions if loading fails
      }

      // Merge all sessions
      const allSessions = [...claudeCodexSessions, ...geminiSessions];

      console.log('[ProjectContext] Loaded sessions:', allSessions.length);
      console.log('[ProjectContext] Session engines:', {
        claude: allSessions.filter(s => s.engine === 'claude').length,
        codex: allSessions.filter(s => s.engine === 'codex').length,
        gemini: allSessions.filter(s => s.engine === 'gemini').length,
        undefined: allSessions.filter(s => !s.engine).length,
      });

      setSessions(allSessions);
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
        // Load Claude/Codex sessions
        const claudeCodexSessions = await api.getProjectSessions(selectedProject.id, selectedProject.path);

        // Load Gemini sessions
        let geminiSessions: Session[] = [];
        try {
          const geminiSessionInfos = await api.listGeminiSessions(selectedProject.path);

          // Convert GeminiSessionInfo to Session format
          geminiSessions = geminiSessionInfos.map(info => ({
            id: info.sessionId,
            project_id: selectedProject.id,
            project_path: selectedProject.path,
            created_at: new Date(info.startTime).getTime() / 1000,
            first_message: info.firstMessage,
            message_timestamp: info.startTime,
            last_message_timestamp: info.startTime,
            engine: 'gemini' as const,
          }));
        } catch (geminiErr) {
          console.warn('[ProjectContext] Failed to refresh Gemini sessions:', geminiErr);
        }

        // Merge all sessions
        const allSessions = [...claudeCodexSessions, ...geminiSessions];
        setSessions(allSessions);
      } catch (err) {
        console.error("Failed to refresh sessions:", err);
      }
    }
  }, [selectedProject]);

  const deleteProject = useCallback(async (project: Project) => {
    try {
      setLoading(true);
      await api.deleteProject(project.id);
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
