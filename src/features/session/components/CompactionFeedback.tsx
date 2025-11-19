import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Minimize2,
  ChevronDown,
  ChevronUp,
  Clock,
  Info,
  CheckCircle2,
  Activity,
  Sparkles,
  TrendingDown,
  ArrowRight
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Interface for compaction event data from Rust backend
 */
export interface CompactionEventData {
  sessionId: string;
  success: boolean;
  originalMessageCount: number;
  compactedMessageCount: number;
  originalTokenCount: number;
  compactedTokenCount: number;
  compressionRatio: number;
  tokensSaved: number;
  processingTimeMs: number;
  error?: string;
  compactionStrategy?: string;
  metadata?: {
    filesProcessed?: number;
    toolCallsOptimized?: number;
    duplicatesRemoved?: number;
  };
}

/**
 * Compaction history entry for timeline tracking
 */
export interface CompactionHistoryEntry {
  id: string;
  timestamp: string;
  beforeCount: number;
  afterCount: number;
  tokensSaved: number;
  compressionRatio: number;
  strategy?: string;
}

/**
 * Props for the CompactionFeedback component
 */
interface CompactionFeedbackProps {
  /** Current session ID to listen for compaction events */
  sessionId: string | null;
  /** Current message count before compaction */
  currentMessageCount: number;
  /** Current estimated token count */
  currentTokenCount: number;
  /** Whether compaction is currently in progress */
  isCompacting: boolean;
  /** Callback when compaction is triggered */
  onCompactionTriggered?: () => void;
  /** Callback when compaction completes */
  onCompactionComplete?: (data: CompactionEventData) => void;
  /** Optional className for styling */
  className?: string;
}

/**
 * Comprehensive compaction feedback component with progress tracking and results
 */
export const CompactionFeedback: React.FC<CompactionFeedbackProps> = ({
  currentMessageCount,
  currentTokenCount,
  isCompacting,
  onCompactionTriggered,
  onCompactionComplete,
  className
}) => {
  // Compaction state
  const [compactionData, setCompactionData] = useState<CompactionEventData | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [compactionHistory, setCompactionHistory] = useState<CompactionHistoryEntry[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState("");
  
  // Animation state
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const [showMetrics, setShowMetrics] = useState(false);
  
  // Progress simulation during compaction
  useEffect(() => {
    if (isCompacting) {
      setProgress(0);
      setCurrentStep("Analyzing conversation structure...");
      
      const steps = [
        { progress: 15, step: "Analyzing conversation structure..." },
        { progress: 30, step: "Identifying redundant content..." },
        { progress: 50, step: "Optimizing message flow..." },
        { progress: 70, step: "Compressing similar exchanges..." },
        { progress: 85, step: "Finalizing compaction..." },
        { progress: 100, step: "Compaction complete!" }
      ];
      
      let currentIndex = 0;
      const interval = setInterval(() => {
        if (currentIndex < steps.length) {
          const { progress, step } = steps[currentIndex];
          setProgress(progress);
          setCurrentStep(step);
          currentIndex++;
        } else {
          clearInterval(interval);
        }
      }, 800);
      
      return () => clearInterval(interval);
    } else {
      setProgress(0);
      setCurrentStep("");
    }
  }, [isCompacting]);
  
  // Handle compaction success
  useEffect(() => {
    if (compactionData?.success && !showSuccessAnimation) {
      setShowSuccessAnimation(true);
      setShowResults(true);
      
      // Add to history
      const historyEntry: CompactionHistoryEntry = {
        id: `comp_${Date.now()}`,
        timestamp: new Date().toISOString(),
        beforeCount: compactionData.originalMessageCount,
        afterCount: compactionData.compactedMessageCount,
        tokensSaved: compactionData.tokensSaved,
        compressionRatio: compactionData.compressionRatio,
        strategy: compactionData.compactionStrategy
      };
      
      setCompactionHistory(prev => [historyEntry, ...prev.slice(0, 9)]); // Keep last 10
      
      // Show metrics with delay
      setTimeout(() => setShowMetrics(true), 300);
      
      // Auto-hide after success
      setTimeout(() => {
        setShowSuccessAnimation(false);
        setShowResults(false);
        setShowMetrics(false);
      }, 8000);
      
      // Callback
      onCompactionComplete?.(compactionData);
    }
  }, [compactionData, showSuccessAnimation, onCompactionComplete]);
  
  // Smart compaction suggestions
  const shouldSuggestCompaction = () => {
    return currentMessageCount > 50 || currentTokenCount > 100000;
  };
  
  const getCompressionEstimate = () => {
    // Rough estimation based on typical compression ratios
    const estimatedRatio = Math.min(0.7, Math.max(0.3, 1 - (currentMessageCount / 200)));
    const estimatedSavings = Math.floor(currentTokenCount * (1 - estimatedRatio));
    return { ratio: estimatedRatio, savings: estimatedSavings };
  };
  
  const handleCompactionTrigger = () => {
    setShowConfirmDialog(true);
  };
  
  const confirmCompaction = () => {
    setShowConfirmDialog(false);
    setCompactionData(null);
    onCompactionTriggered?.();
  };
  
  const estimate = getCompressionEstimate();
  
  return (
    <TooltipProvider>
      <div className={cn("space-y-2", className)}>
        {/* Compaction Trigger & Status */}
        <AnimatePresence mode="wait">
          {isCompacting ? (
            <motion.div
              key="compacting"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
            >
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    >
                      <Minimize2 className="h-5 w-5 text-primary" />
                    </motion.div>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-primary">Compacting Conversation</span>
                        <span className="text-sm text-muted-foreground">{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                      <p className="text-sm text-muted-foreground">{currentStep}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ) : showResults && compactionData?.success ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <Card className="border-green-500/20 bg-green-500/5">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.1, type: "spring", stiffness: 300 }}
                    >
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    </motion.div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-green-700 dark:text-green-400">
                          Compaction Complete!
                        </span>
                        <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                          <TrendingDown className="h-3 w-3 mr-1" />
                          {Math.round((1 - compactionData.compressionRatio) * 100)}% reduced
                        </Badge>
                      </div>
                      
                      <AnimatePresence>
                        {showMetrics && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.3 }}
                            className="grid grid-cols-3 gap-4 mt-3"
                          >
                            <div className="text-center">
                              <div className="text-lg font-bold text-foreground">
                                {compactionData.originalMessageCount}
                                <ArrowRight className="inline h-4 w-4 mx-1" />
                                {compactionData.compactedMessageCount}
                              </div>
                              <div className="text-xs text-muted-foreground">Messages</div>
                            </div>
                            <div className="text-center">
                              <div className="text-lg font-bold text-green-600 dark:text-green-400">
                                -{compactionData.tokensSaved.toLocaleString()}
                              </div>
                              <div className="text-xs text-muted-foreground">Tokens Saved</div>
                            </div>
                            <div className="text-center">
                              <div className="text-lg font-bold text-muted-foreground">
                                {compactionData.processingTimeMs}ms
                              </div>
                              <div className="text-xs text-muted-foreground">Processing Time</div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ) : shouldSuggestCompaction() ? (
            <motion.div
              key="suggestion"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Card className="border-amber-500/20 bg-amber-500/5">
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                          Consider compacting this conversation
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={handleCompactionTrigger}
                          className="h-7 px-2 text-amber-700 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/20"
                        >
                          <Minimize2 className="h-3 w-3 mr-1" />
                          Compact
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Estimated savings: ~{estimate.savings.toLocaleString()} tokens ({Math.round((1 - estimate.ratio) * 100)}% reduction)
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ) : null}
        </AnimatePresence>
        
        {/* Compaction History */}
        {compactionHistory.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="border-muted">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    Compaction History
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="h-6 w-6 p-0"
                  >
                    {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </Button>
                </div>
              </CardHeader>
              
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <CardContent className="pt-0 space-y-2">
                      {compactionHistory.slice(0, 3).map((entry, index) => (
                        <motion.div
                          key={entry.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.1 }}
                          className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                        >
                          <div className="flex items-center gap-2">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">
                              {new Date(entry.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span>{entry.beforeCount} → {entry.afterCount}</span>
                            <Badge variant="outline" className="text-xs">
                              -{entry.tokensSaved.toLocaleString()}
                            </Badge>
                          </div>
                        </motion.div>
                      ))}
                    </CardContent>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          </motion.div>
        )}
        
        {/* Confirmation Dialog */}
        <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Minimize2 className="h-5 w-5" />
                Compact Conversation
              </DialogTitle>
              <DialogDescription>
                This will analyze and compress your conversation to reduce token usage while preserving important context.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/50 p-3 rounded-md">
                  <div className="text-sm font-medium mb-1">Current State</div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div>{currentMessageCount} messages</div>
                    <div>~{currentTokenCount.toLocaleString()} tokens</div>
                  </div>
                </div>
                <div className="bg-primary/5 p-3 rounded-md border border-primary/20">
                  <div className="text-sm font-medium mb-1">After Compaction</div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div>~{Math.floor(currentMessageCount * estimate.ratio)} messages</div>
                    <div>~{(currentTokenCount - estimate.savings).toLocaleString()} tokens</div>
                  </div>
                </div>
              </div>
              
              <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-md border border-amber-200 dark:border-amber-800">
                <div className="flex gap-2">
                  <Info className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-amber-700 dark:text-amber-300">
                    <p className="font-medium mb-1">What happens during compaction:</p>
                    <ul className="text-xs space-y-1 ml-2">
                      <li>• Redundant messages are merged or removed</li>
                      <li>• Similar tool calls are consolidated</li>
                      <li>• Context is preserved for ongoing conversation</li>
                      <li>• Original conversation is safely backed up</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
                Cancel
              </Button>
              <Button onClick={confirmCompaction} className="gap-2">
                <Minimize2 className="h-4 w-4" />
                Compact Conversation
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
};

/**
 * Hook to handle compaction events and manage state
 */
export const useCompactionEvents = (sessionId: string | null) => {
  const [compactionData, setCompactionData] = useState<CompactionEventData | null>(null);
  const [isCompacting, setIsCompacting] = useState(false);
  
  useEffect(() => {
    if (!sessionId) return;
    
    // This would be implemented with actual Tauri event listeners
    // For now, this is a placeholder for the integration
    console.log('[CompactionFeedback] Setting up compaction event listeners');

    // Cleanup function would remove event listeners
    return () => {
      // Remove event listeners
    };
  }, []);
  
  const triggerCompaction = () => {
    setIsCompacting(true);
    setCompactionData(null);
    // This would trigger the actual compaction command
    // For now, placeholder
  };
  
  return {
    compactionData,
    isCompacting,
    triggerCompaction
  };
};