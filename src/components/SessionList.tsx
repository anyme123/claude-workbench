import React, { useState } from "react";
import { ArrowLeft, Clock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { ClaudeMemoriesDropdown } from "@/components/ClaudeMemoriesDropdown";
import { cn } from "@/lib/utils";
import { formatUnixTimestamp, formatISOTimestamp, truncateText, getFirstLine } from "@/lib/date-utils";
import type { Session, ClaudeMdFile } from "@/lib/api";
import { useTranslation } from '@/hooks/useTranslation';

interface SessionListProps {
  /**
   * Array of sessions to display
   */
  sessions: Session[];
  /**
   * The current project path being viewed
   */
  projectPath: string;
  /**
   * Callback to go back to project list
   */
  onBack: () => void;
  /**
   * Callback when a session is clicked
   */
  onSessionClick?: (session: Session) => void;
  /**
   * Callback when a CLAUDE.md file should be edited
   */
  onEditClaudeFile?: (file: ClaudeMdFile) => void;
  /**
   * Callback when new session button is clicked
   */
  onNewSession?: (projectPath: string) => void;
  /**
   * Optional className for styling
   */
  className?: string;
}

const ITEMS_PER_PAGE = 20;

/**
 * SessionList component - Displays paginated sessions for a specific project
 * 
 * @example
 * <SessionList
 *   sessions={sessions}
 *   projectPath="/Users/example/project"
 *   onBack={() => setSelectedProject(null)}
 *   onSessionClick={(session) => console.log('Selected session:', session)}
 * />
 */
export const SessionList: React.FC<SessionListProps> = ({
  sessions,
  projectPath,
  onBack,
  onSessionClick,
  onEditClaudeFile,
  onNewSession,
  className,
}) => {
  const { t } = useTranslation();
  const [currentPage, setCurrentPage] = useState(1);

  // 🔧 过滤掉空白无用的会话（没有 first_message 或 id 为空的）
  const validSessions = sessions.filter(session =>
    session.id && session.id.trim() !== '' &&
    (session.first_message && session.first_message.trim() !== '')
  );

  // 🔧 按活跃度排序：优先使用 message_timestamp，否则使用 created_at
  const sortedSessions = [...validSessions].sort((a, b) => {
    const timeA = a.message_timestamp
      ? new Date(a.message_timestamp).getTime()
      : a.created_at * 1000;
    const timeB = b.message_timestamp
      ? new Date(b.message_timestamp).getTime()
      : b.created_at * 1000;
    return timeB - timeA; // 降序：最新的在前
  });

  // Calculate pagination
  const totalPages = Math.ceil(sortedSessions.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentSessions = sortedSessions.slice(startIndex, endIndex);
  
  // Reset to page 1 if sessions change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [sortedSessions.length]);

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center space-x-3">
        {/* 🔧 IMPROVED: 提升返回项目列表按钮的显著性 */}
        <Button
          variant="default"
          size="default"
          onClick={onBack}
          className="h-10 px-4 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition-all duration-200 shadow-md"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          <span>返回项目列表</span>
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-medium truncate">{projectPath}</h2>
          <p className="text-xs text-muted-foreground">
            {validSessions.length} valid session{validSessions.length !== 1 ? 's' : ''}
            {sessions.length !== validSessions.length && (
              <span className="text-muted-foreground/70"> ({sessions.length - validSessions.length} hidden)</span>
            )}
          </p>
        </div>
      </div>

      {/* CLAUDE.md Memories Dropdown */}
      {onEditClaudeFile && (
        <div>
          <ClaudeMemoriesDropdown
            projectPath={projectPath}
            onEditFile={onEditClaudeFile}
          />
        </div>
      )}

      {/* New Session Button */}
      {onNewSession && (
        <div className="mb-4">
          <Button
            onClick={() => onNewSession(projectPath)}
            size="default"
            className="w-full max-w-md"
          >
            <Plus className="mr-2 h-4 w-4" />
            {t('claude.newSession')}
          </Button>
        </div>
      )}

      {/* Compact session list */}
      <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
        {currentSessions.map((session) => (
          <button
            key={session.id}
            onClick={() => onSessionClick?.(session)}
            className={cn(
              "w-full text-left px-4 py-2.5 hover:bg-muted/30 transition-colors group",
              session.todo_data && "bg-primary/5 border-l-2 border-l-primary"
            )}
          >
            <div className="flex items-center justify-between gap-3">
              {/* Session info */}
              <div className="flex-1 min-w-0 space-y-0.5">
                {/* First message preview */}
                <p className="text-sm font-medium truncate text-foreground group-hover:text-primary transition-colors">
                  {session.first_message
                    ? truncateText(getFirstLine(session.first_message), 80)
                    : session.id
                  }
                </p>

                {/* Session ID (small and subtle) */}
                <p className="text-xs font-mono text-muted-foreground truncate">
                  {session.id}
                </p>
              </div>

              {/* Timestamp */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                <Clock className="h-3 w-3" />
                <span>
                  {session.message_timestamp
                    ? formatISOTimestamp(session.message_timestamp)
                    : formatUnixTimestamp(session.created_at)
                  }
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
      />
    </div>
  );
}; 