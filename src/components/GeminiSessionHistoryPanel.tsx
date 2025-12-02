/**
 * GeminiSessionHistoryPanel Component
 *
 * Displays a list of historical Gemini CLI sessions for the current project.
 * Allows users to view, resume, or delete previous sessions.
 */

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { GeminiSessionInfo } from '@/types/gemini';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Clock, RefreshCw, Trash2, Play, Eye } from 'lucide-react';

interface GeminiSessionHistoryPanelProps {
  projectPath: string;
  onResumeSession?: (sessionId: string) => void;
  onViewSession?: (sessionId: string) => void;
  className?: string;
}

export const GeminiSessionHistoryPanel: React.FC<GeminiSessionHistoryPanelProps> = ({
  projectPath,
  onResumeSession,
  onViewSession,
  className = '',
}) => {
  const [sessions, setSessions] = useState<GeminiSessionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load sessions on mount and when projectPath changes
  useEffect(() => {
    if (projectPath) {
      loadSessions();
    }
  }, [projectPath]);

  const loadSessions = async () => {
    if (!projectPath) return;

    setLoading(true);
    setError(null);

    try {
      const sessionList = await api.listGeminiSessions(projectPath);
      setSessions(sessionList);
    } catch (err) {
      console.error('Failed to load Gemini sessions:', err);
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  const handleResume = (sessionId: string) => {
    if (onResumeSession) {
      onResumeSession(sessionId);
    }
  };

  const handleView = (sessionId: string) => {
    if (onViewSession) {
      onViewSession(sessionId);
    }
  };

  const handleDelete = async (sessionId: string) => {
    if (!window.confirm('确定要删除这个会话吗？此操作无法撤销。')) {
      return;
    }

    try {
      await api.deleteGeminiSession(projectPath, sessionId);
      // Refresh list after deletion
      await loadSessions();
    } catch (err) {
      console.error('Failed to delete session:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete session');
    }
  };

  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return '刚刚';
      if (diffMins < 60) return `${diffMins} 分钟前`;
      if (diffHours < 24) return `${diffHours} 小时前`;
      if (diffDays < 7) return `${diffDays} 天前`;

      return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return timestamp;
    }
  };

  const truncateMessage = (message: string | undefined, maxLength: number = 60) => {
    if (!message) return '(无消息)';
    if (message.length <= maxLength) return message;
    return message.substring(0, maxLength) + '...';
  };

  if (loading && sessions.length === 0) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <div className="flex items-center gap-2 text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>加载会话历史...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-4 ${className}`}>
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={loadSessions}
          >
            <RefreshCw className="mr-2 h-3 w-3" />
            重试
          </Button>
        </div>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center p-8 text-center ${className}`}>
        <Clock className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <p className="text-sm text-muted-foreground mb-2">暂无历史会话</p>
        <p className="text-xs text-muted-foreground">使用 Gemini 执行任务后会在此显示</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Gemini 会话历史</h3>
          <span className="text-xs text-muted-foreground">({sessions.length})</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={loadSessions}
          disabled={loading}
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Session List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-2">
          {sessions.map((session) => (
            <div
              key={session.sessionId}
              className="rounded-md border p-3 hover:bg-accent/50 transition-colors"
            >
              {/* Session Header */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground mb-1">
                    {formatTimestamp(session.startTime)}
                  </p>
                  <p className="text-sm font-medium line-clamp-2">
                    {truncateMessage(session.firstMessage)}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 mt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => handleResume(session.sessionId)}
                >
                  <Play className="h-3 w-3 mr-1" />
                  恢复
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => handleView(session.sessionId)}
                >
                  <Eye className="h-3 w-3 mr-1" />
                  查看
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-destructive hover:text-destructive"
                  onClick={() => handleDelete(session.sessionId)}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  删除
                </Button>
              </div>

              {/* Session ID (for debugging) */}
              <p className="text-xs text-muted-foreground mt-2 font-mono truncate">
                {session.sessionId}
              </p>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

export default GeminiSessionHistoryPanel;
