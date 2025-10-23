import React, { useState } from "react";
import { FileText, ArrowLeft, Calendar, Clock, MessageSquare, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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

const ITEMS_PER_PAGE = 5;

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

  // Calculate pagination
  const totalPages = Math.ceil(validSessions.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentSessions = validSessions.slice(startIndex, endIndex);
  
  // Reset to page 1 if sessions change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [validSessions.length]);

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

      <div className="space-y-2">
        {currentSessions.map((session) => (
          <div key={session.id}>
              <Card
                className={cn(
                  "transition-all hover:shadow-md hover:scale-[1.01] active:scale-[0.99] cursor-pointer",
                  session.todo_data && "border-l-4 border-l-primary"
                )}
                onClick={() => {
                  onSessionClick?.(session);
                }}
              >
                <CardContent className="p-3">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3 flex-1 min-w-0">
                        <FileText className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <div className="space-y-1 flex-1 min-w-0">
                          <p className="font-mono text-xs text-muted-foreground">{session.id}</p>
                          
                          {/* First message preview */}
                          {session.first_message && (
                            <div className="space-y-1">
                              <div className="flex items-center space-x-1 text-xs text-muted-foreground">
                                <MessageSquare className="h-3 w-3" />
                                <span>First message:</span>
                              </div>
                              <p className="text-xs line-clamp-2 text-foreground/80">
                                {truncateText(getFirstLine(session.first_message), 100)}
                              </p>
                            </div>
                          )}
                          
                          {/* Metadata */}
                          <div className="flex items-center space-x-3 text-xs text-muted-foreground">
                            {/* Message timestamp if available, otherwise file creation time */}
                            <div className="flex items-center space-x-1">
                              <Clock className="h-3 w-3" />
                              <span>
                                {session.message_timestamp 
                                  ? formatISOTimestamp(session.message_timestamp)
                                  : formatUnixTimestamp(session.created_at)
                                }
                              </span>
                            </div>
                            
                            {session.todo_data && (
                              <div className="flex items-center space-x-1">
                                <Calendar className="h-3 w-3" />
                                <span>Has todo</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
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
}; 