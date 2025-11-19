import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Minimize2,
  CheckCircle2,
  AlertCircle,
  Search,
  RefreshCw,
  Target,
  Package,
  Sparkles,
  Activity,
  Clock,
  Gauge
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Compaction step information
 */
interface CompactionStep {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  estimatedDuration: number; // in ms
  progress: number; // 0-100
}

/**
 * Compaction stage definitions
 */
const COMPACTION_STAGES: CompactionStep[] = [
  {
    id: "analyze",
    label: "Analyzing Conversation",
    description: "Examining message structure and identifying optimization opportunities",
    icon: Search,
    estimatedDuration: 2000,
    progress: 15
  },
  {
    id: "identify",
    label: "Identifying Redundancy",
    description: "Finding duplicate content, similar exchanges, and mergeable messages",
    icon: Target,
    estimatedDuration: 3000,
    progress: 35
  },
  {
    id: "optimize",
    label: "Optimizing Flow",
    description: "Reorganizing conversation structure for better context preservation",
    icon: RefreshCw,
    estimatedDuration: 2500,
    progress: 60
  },
  {
    id: "compress",
    label: "Compressing Content",
    description: "Merging similar messages and reducing token usage",
    icon: Package,
    estimatedDuration: 2000,
    progress: 80
  },
  {
    id: "finalize",
    label: "Finalizing",
    description: "Completing compaction and updating conversation state",
    icon: CheckCircle2,
    estimatedDuration: 1000,
    progress: 100
  }
];

/**
 * Props for CompactionProgress component
 */
interface CompactionProgressProps {
  /** Whether compaction is currently active */
  isActive: boolean;
  /** Current step index (0-based) */
  currentStepIndex?: number;
  /** Overall progress (0-100) */
  overallProgress?: number;
  /** Estimated time remaining in seconds */
  estimatedTimeRemaining?: number;
  /** Current processing details */
  currentDetails?: string;
  /** Whether compaction completed successfully */
  completed?: boolean;
  /** Whether compaction failed */
  failed?: boolean;
  /** Error message if failed */
  errorMessage?: string;
  /** Callback when animation completes */
  onAnimationComplete?: () => void;
  /** Optional className for styling */
  className?: string;
}

/**
 * Advanced compaction progress component with smooth animations
 */
export const CompactionProgress: React.FC<CompactionProgressProps> = ({
  isActive,
  currentStepIndex = 0,
  overallProgress = 0,
  estimatedTimeRemaining,
  currentDetails,
  completed = false,
  failed = false,
  errorMessage,
  onAnimationComplete,
  className
}) => {
  const [visibleSteps, setVisibleSteps] = useState<number>(0);
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const [showDetails, setShowDetails] = useState(false);
  const [pulseStep, setPulseStep] = useState(-1);

  // Animate step visibility
  useEffect(() => {
    if (isActive) {
      const timer = setInterval(() => {
        setVisibleSteps(prev => {
          if (prev < COMPACTION_STAGES.length) {
            return prev + 1;
          }
          clearInterval(timer);
          return prev;
        });
      }, 200);
      
      return () => clearInterval(timer);
    } else {
      setVisibleSteps(0);
    }
  }, [isActive]);

  // Animate progress bar
  useEffect(() => {
    if (isActive) {
      const targetProgress = COMPACTION_STAGES[currentStepIndex]?.progress || overallProgress;
      const increment = (targetProgress - animatedProgress) / 20;
      
      const timer = setInterval(() => {
        setAnimatedProgress(prev => {
          const next = prev + increment;
          if (Math.abs(next - targetProgress) < 1) {
            clearInterval(timer);
            return targetProgress;
          }
          return next;
        });
      }, 50);
      
      return () => clearInterval(timer);
    } else {
      setAnimatedProgress(0);
    }
  }, [isActive, currentStepIndex, overallProgress]);

  // Pulse effect for current step
  useEffect(() => {
    if (isActive && currentStepIndex >= 0) {
      setPulseStep(currentStepIndex);
      const timer = setTimeout(() => setPulseStep(-1), 1000);
      return () => clearTimeout(timer);
    }
  }, [isActive, currentStepIndex]);

  // Show details after initial animation
  useEffect(() => {
    if (isActive) {
      const timer = setTimeout(() => setShowDetails(true), 1000);
      return () => clearTimeout(timer);
    } else {
      setShowDetails(false);
    }
  }, [isActive]);

  // Handle completion animation
  useEffect(() => {
    if (completed && onAnimationComplete) {
      const timer = setTimeout(onAnimationComplete, 2000);
      return () => clearTimeout(timer);
    }
  }, [completed, onAnimationComplete]);

  const formatTimeRemaining = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  };

  if (!isActive && !completed && !failed) {
    return null;
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={failed ? "failed" : completed ? "completed" : "active"}
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.95 }}
        transition={{ duration: 0.3 }}
        className={cn("space-y-3", className)}
      >
        {/* Main Progress Card */}
        <Card className={cn(
          "transition-all duration-300",
          failed && "border-destructive/40 bg-destructive/5",
          completed && "border-green-500/40 bg-green-500/5",
          isActive && "border-primary/40 bg-primary/5"
        )}>
          <CardContent className="p-4">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <motion.div
                animate={isActive ? { rotate: 360 } : {}}
                transition={{ duration: 2, repeat: isActive ? Infinity : 0, ease: "linear" }}
              >
                {failed ? (
                  <AlertCircle className="h-5 w-5 text-destructive" />
                ) : completed ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <Minimize2 className="h-5 w-5 text-primary" />
                )}
              </motion.div>
              
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className={cn(
                    "font-medium",
                    failed && "text-destructive",
                    completed && "text-green-700 dark:text-green-400",
                    isActive && "text-primary"
                  )}>
                    {failed ? "Compaction Failed" : completed ? "Compaction Complete!" : "Compacting Conversation"}
                  </h3>
                  
                  {isActive && estimatedTimeRemaining && (
                    <Badge variant="secondary" className="text-xs">
                      <Clock className="h-3 w-3 mr-1" />
                      {formatTimeRemaining(estimatedTimeRemaining)}
                    </Badge>
                  )}
                </div>
                
                {/* Progress Bar */}
                {!failed && (
                  <div className="mt-2 space-y-1">
                    <Progress 
                      value={completed ? 100 : animatedProgress} 
                      className={cn(
                        "h-2 transition-all duration-200",
                        completed && "progress-green"
                      )}
                    />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {currentDetails || COMPACTION_STAGES[currentStepIndex]?.description || "Processing..."}
                      </span>
                      <span>{Math.round(completed ? 100 : animatedProgress)}%</span>
                    </div>
                  </div>
                )}
                
                {/* Error Message */}
                {failed && errorMessage && (
                  <p className="text-sm text-destructive mt-2">{errorMessage}</p>
                )}
              </div>
            </div>

            {/* Step Progress Indicators */}
            <AnimatePresence>
              {(isActive || completed) && showDetails && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-2"
                >
                  <div className="grid gap-2">
                    {COMPACTION_STAGES.map((step, index) => {
                      const isCurrentStep = index === currentStepIndex;
                      const isCompletedStep = completed || index < currentStepIndex;
                      const isVisible = index < visibleSteps;
                      const shouldPulse = pulseStep === index;

                      return (
                        <AnimatePresence key={step.id}>
                          {isVisible && (
                            <motion.div
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ 
                                opacity: 1, 
                                x: 0,
                                scale: shouldPulse ? [1, 1.02, 1] : 1
                              }}
                              exit={{ opacity: 0, x: 20 }}
                              transition={{ 
                                duration: 0.3,
                                delay: index * 0.1,
                                scale: { duration: 0.5 }
                              }}
                              className={cn(
                                "flex items-center gap-3 p-2 rounded-md transition-all duration-200",
                                isCurrentStep && "bg-primary/10 border border-primary/20",
                                isCompletedStep && !isCurrentStep && "bg-muted/50"
                              )}
                            >
                              <motion.div
                                animate={isCurrentStep ? { 
                                  rotate: [0, 5, -5, 0],
                                  scale: [1, 1.1, 1]
                                } : {}}
                                transition={{ 
                                  duration: 1,
                                  repeat: isCurrentStep ? Infinity : 0,
                                  repeatType: "reverse"
                                }}
                                className={cn(
                                  "flex-shrink-0 p-1 rounded-full",
                                  isCompletedStep && "bg-green-100 dark:bg-green-900/20",
                                  isCurrentStep && "bg-primary/20",
                                  !isCurrentStep && !isCompletedStep && "bg-muted"
                                )}
                              >
                                {isCompletedStep ? (
                                  <CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400" />
                                ) : (
                                  <step.icon className={cn(
                                    "h-3 w-3",
                                    isCurrentStep && "text-primary",
                                    !isCurrentStep && "text-muted-foreground"
                                  )} />
                                )}
                              </motion.div>
                              
                              <div className="flex-1 min-w-0">
                                <div className={cn(
                                  "text-sm font-medium",
                                  isCurrentStep && "text-primary",
                                  isCompletedStep && !isCurrentStep && "text-muted-foreground",
                                  !isCurrentStep && !isCompletedStep && "text-muted-foreground"
                                )}>
                                  {step.label}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {step.description}
                                </div>
                              </div>
                              
                              {isCurrentStep && (
                                <motion.div
                                  initial={{ opacity: 0, scale: 0 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  className="flex-shrink-0"
                                >
                                  <Activity className="h-3 w-3 text-primary animate-pulse" />
                                </motion.div>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Success Celebration */}
            {completed && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5, duration: 0.5 }}
                className="flex items-center justify-center mt-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-md border border-green-200 dark:border-green-800"
              >
                <motion.div
                  animate={{ rotate: [0, 10, -10, 0] }}
                  transition={{ duration: 0.5, repeat: 2 }}
                >
                  <Sparkles className="h-5 w-5 text-green-500 mr-2" />
                </motion.div>
                <span className="text-sm font-medium text-green-700 dark:text-green-300">
                  Conversation successfully optimized!
                </span>
              </motion.div>
            )}
          </CardContent>
        </Card>

        {/* Real-time Statistics */}
        {isActive && showDetails && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <Card className="border-muted">
              <CardContent className="p-3">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <motion.div
                      key={currentStepIndex}
                      initial={{ scale: 1.2 }}
                      animate={{ scale: 1 }}
                      transition={{ duration: 0.3 }}
                      className="text-lg font-bold text-primary"
                    >
                      {currentStepIndex + 1}/{COMPACTION_STAGES.length}
                    </motion.div>
                    <div className="text-xs text-muted-foreground">Steps</div>
                  </div>
                  
                  <div>
                    <motion.div
                      animate={{ opacity: [1, 0.5, 1] }}
                      transition={{ duration: 1, repeat: Infinity }}
                      className="text-lg font-bold text-muted-foreground"
                    >
                      <Gauge className="h-5 w-5 mx-auto" />
                    </motion.div>
                    <div className="text-xs text-muted-foreground">Processing</div>
                  </div>
                  
                  <div>
                    <motion.div
                      key={Math.floor(animatedProgress / 10)}
                      initial={{ scale: 1.1 }}
                      animate={{ scale: 1 }}
                      transition={{ duration: 0.2 }}
                      className="text-lg font-bold text-green-600 dark:text-green-400"
                    >
                      {Math.round(animatedProgress)}%
                    </motion.div>
                    <div className="text-xs text-muted-foreground">Complete</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

/**
 * Hook for managing compaction progress state
 */
export const useCompactionProgress = () => {
  const [isActive, setIsActive] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [overallProgress, setOverallProgress] = useState(0);
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<number | undefined>();
  const [currentDetails, setCurrentDetails] = useState<string | undefined>();
  const [completed, setCompleted] = useState(false);
  const [failed, setFailed] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const startCompaction = () => {
    setIsActive(true);
    setCurrentStepIndex(0);
    setOverallProgress(0);
    setCompleted(false);
    setFailed(false);
    setErrorMessage(undefined);
    
    // Simulate progress through stages
    let stepIndex = 0;
    const progressInterval = setInterval(() => {
      if (stepIndex < COMPACTION_STAGES.length) {
        setCurrentStepIndex(stepIndex);
        setOverallProgress(COMPACTION_STAGES[stepIndex].progress);
        setCurrentDetails(COMPACTION_STAGES[stepIndex].description);
        
        // Calculate estimated time remaining
        const remainingSteps = COMPACTION_STAGES.slice(stepIndex + 1);
        const remainingTime = remainingSteps.reduce((total, step) => total + step.estimatedDuration, 0);
        setEstimatedTimeRemaining(remainingTime / 1000);
        
        stepIndex++;
      } else {
        clearInterval(progressInterval);
        setCompleted(true);
        setIsActive(false);
      }
    }, 2000);
  };

  const failCompaction = (error: string) => {
    setFailed(true);
    setIsActive(false);
    setErrorMessage(error);
  };

  const resetProgress = () => {
    setIsActive(false);
    setCurrentStepIndex(0);
    setOverallProgress(0);
    setEstimatedTimeRemaining(undefined);
    setCurrentDetails(undefined);
    setCompleted(false);
    setFailed(false);
    setErrorMessage(undefined);
  };

  return {
    isActive,
    currentStepIndex,
    overallProgress,
    estimatedTimeRemaining,
    currentDetails,
    completed,
    failed,
    errorMessage,
    startCompaction,
    failCompaction,
    resetProgress
  };
};