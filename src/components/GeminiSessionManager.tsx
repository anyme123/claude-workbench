/**
 * GeminiSessionManager Component
 *
 * Manages Gemini session history UI including:
 * - Session list panel
 * - Session detail viewer
 * - Integration with prompt execution
 *
 * Usage Example:
 *
 * <GeminiSessionManager
 *   projectPath="/path/to/project"
 *   onResumeSession={(sessionId) => {
 *     // Execute Gemini with session resumption
 *     api.executeGemini({
 *       projectPath,
 *       prompt: "继续之前的任务",
 *       sessionId: sessionId,
 *       model: "gemini-2.5-pro",
 *       approvalMode: "auto_edit"
 *     });
 *   }}
 * />
 */

import React, { useState } from 'react';
import { GeminiSessionHistoryPanel } from './GeminiSessionHistoryPanel';
import { GeminiSessionDetailViewer } from './GeminiSessionDetailViewer';
import { Button } from '@/components/ui/button';
import { History } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface GeminiSessionManagerProps {
  projectPath: string;
  onResumeSession?: (sessionId: string) => void;
  className?: string;
}

export const GeminiSessionManager: React.FC<GeminiSessionManagerProps> = ({
  projectPath,
  onResumeSession,
  className = '',
}) => {
  const [showHistory, setShowHistory] = useState(false);
  const [viewingSessionId, setViewingSessionId] = useState<string | null>(null);

  const handleResumeSession = (sessionId: string) => {
    setShowHistory(false);
    setViewingSessionId(null);

    if (onResumeSession) {
      onResumeSession(sessionId);
    }
  };

  const handleViewSession = (sessionId: string) => {
    setViewingSessionId(sessionId);
  };

  return (
    <div className={className}>
      {/* History Panel Trigger */}
      <Button variant="outline" size="sm" onClick={() => setShowHistory(true)}>
        <History className="h-4 w-4 mr-2" />
        Gemini 历史
      </Button>

      {/* History Panel Dialog */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-md h-[80vh]">
          <DialogHeader>
            <DialogTitle>Gemini 会话历史</DialogTitle>
          </DialogHeader>
          <div className="h-[calc(80vh-4rem)]">
            <GeminiSessionHistoryPanel
              projectPath={projectPath}
              onResumeSession={handleResumeSession}
              onViewSession={handleViewSession}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Session Detail Viewer Dialog */}
      <Dialog
        open={!!viewingSessionId}
        onOpenChange={(open) => !open && setViewingSessionId(null)}
      >
        <DialogContent className="max-w-4xl h-[80vh]">
          <DialogHeader>
            <DialogTitle>会话详情</DialogTitle>
          </DialogHeader>
          {viewingSessionId && (
            <GeminiSessionDetailViewer
              projectPath={projectPath}
              sessionId={viewingSessionId}
              onClose={() => setViewingSessionId(null)}
              onResume={handleResumeSession}
              className="h-[calc(80vh-4rem)]"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GeminiSessionManager;
