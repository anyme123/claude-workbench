import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Minimize2,
  Info,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Zap,
  Target,
  TrendingDown,
  BarChart3,
  Package,
  Shield,
  RefreshCw,
  Sparkles,
  Brain
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/**
 * Compaction strategy options
 */
export interface CompactionStrategy {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  estimatedSavings: number; // percentage
  preservationLevel: "high" | "medium" | "low";
  recommended: boolean;
  features: string[];
  risks: string[];
}

/**
 * Available compaction strategies
 */
const COMPACTION_STRATEGIES: CompactionStrategy[] = [
  {
    id: "smart",
    name: "Smart Compaction",
    description: "AI-powered optimization that preserves context while maximizing efficiency",
    icon: Brain,
    estimatedSavings: 40,
    preservationLevel: "high",
    recommended: true,
    features: [
      "Context-aware message merging",
      "Intelligent redundancy detection",
      "Tool call optimization",
      "Conversation flow preservation"
    ],
    risks: [
      "Minimal risk of information loss",
      "May take longer to process"
    ]
  },
  {
    id: "aggressive",
    name: "Aggressive Compression",
    description: "Maximum token reduction with acceptable context preservation",
    icon: Zap,
    estimatedSavings: 65,
    preservationLevel: "medium",
    recommended: false,
    features: [
      "High compression ratio",
      "Duplicate content removal",
      "Similar exchange merging",
      "Fast processing"
    ],
    risks: [
      "Some context may be lost",
      "Minor details might be merged"
    ]
  },
  {
    id: "conservative",
    name: "Conservative Optimization",
    description: "Gentle optimization that prioritizes complete context preservation",
    icon: Shield,
    estimatedSavings: 25,
    preservationLevel: "high",
    recommended: false,
    features: [
      "Complete context preservation",
      "Safe redundancy removal",
      "Minimal changes to flow",
      "Reversible operations"
    ],
    risks: [
      "Lower compression ratio",
      "May not address all inefficiencies"
    ]
  }
];

/**
 * Conversation analysis data for smart suggestions
 */
export interface ConversationAnalysis {
  messageCount: number;
  totalTokens: number;
  duplicateMessages: number;
  similarExchanges: number;
  redundantToolCalls: number;
  inefficientPatterns: string[];
  estimatedSavingsByStrategy: { [strategyId: string]: number };
  complexityScore: number; // 0-100
  riskLevel: "low" | "medium" | "high";
}

/**
 * Props for CompactionConfirmDialog
 */
interface CompactionConfirmDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when dialog open state changes */
  onOpenChange: (open: boolean) => void;
  /** Current conversation analysis */
  analysis: ConversationAnalysis;
  /** Callback when compaction is confirmed */
  onConfirm: (strategy: string, options: CompactionOptions) => void;
  /** Whether compaction is currently in progress */
  isCompacting?: boolean;
  /** Optional className for styling */
  className?: string;
}

/**
 * Compaction options
 */
export interface CompactionOptions {
  strategy: string;
  preserveToolOutputs: boolean;
  preserveCodeBlocks: boolean;
  preserveFileReferences: boolean;
  createBackup: boolean;
  notifyOnCompletion: boolean;
}

/**
 * Sophisticated compaction confirmation dialog with smart suggestions
 */
export const CompactionConfirmDialog: React.FC<CompactionConfirmDialogProps> = ({
  open,
  onOpenChange,
  analysis,
  onConfirm,
  isCompacting = false,
  className
}) => {
  const [selectedStrategy, setSelectedStrategy] = useState("smart");
  const [options, setOptions] = useState<CompactionOptions>({
    strategy: "smart",
    preserveToolOutputs: true,
    preserveCodeBlocks: true,
    preserveFileReferences: true,
    createBackup: true,
    notifyOnCompletion: true
  });
  const [currentTab, setCurrentTab] = useState("overview");

  // Update strategy in options when selection changes
  useEffect(() => {
    setOptions(prev => ({ ...prev, strategy: selectedStrategy }));
  }, [selectedStrategy]);

  // Get selected strategy details
  const selectedStrategyData = COMPACTION_STRATEGIES.find(s => s.id === selectedStrategy);
  const estimatedSavings = analysis.estimatedSavingsByStrategy[selectedStrategy] || 
                          selectedStrategyData?.estimatedSavings || 0;

  // Calculate conversation health score
  const getHealthScore = () => {
    const efficiency = Math.max(0, 100 - (analysis.totalTokens / analysis.messageCount / 500 * 100));
    const redundancy = Math.max(0, 100 - (analysis.duplicateMessages + analysis.redundantToolCalls) * 10);
    return Math.round((efficiency + redundancy) / 2);
  };

  const healthScore = getHealthScore();

  // Get health color
  const getHealthColor = (score: number) => {
    if (score >= 80) return "text-green-500";
    if (score >= 60) return "text-yellow-500";
    return "text-red-500";
  };

  // Handle confirmation
  const handleConfirm = () => {
    onConfirm(selectedStrategy, options);
  };

  // Risk level indicators
  const getRiskLevelColor = (level: "low" | "medium" | "high") => {
    switch (level) {
      case "low": return "text-green-500 bg-green-50 dark:bg-green-900/20";
      case "medium": return "text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20";
      case "high": return "text-red-500 bg-red-50 dark:bg-red-900/20";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-w-4xl max-h-[90vh] overflow-hidden", className)}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Minimize2 className="h-5 w-5" />
            Optimize Conversation
          </DialogTitle>
          <DialogDescription>
            Analyze and compress your conversation to improve efficiency while preserving important context.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <Tabs value={currentTab} onValueChange={setCurrentTab} className="h-full flex flex-col">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="strategies">Strategies</TabsTrigger>
              <TabsTrigger value="options">Options</TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto">
              <TabsContent value="overview" className="space-y-4 mt-4">
                {/* Conversation Health */}
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-medium flex items-center gap-2">
                        <BarChart3 className="h-4 w-4" />
                        Conversation Health
                      </h3>
                      <Badge variant="outline" className={getHealthColor(healthScore)}>
                        {healthScore}% Healthy
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Messages</span>
                          <span className="font-medium">{analysis.messageCount}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Total Tokens</span>
                          <span className="font-medium">{analysis.totalTokens.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Avg per Message</span>
                          <span className="font-medium">{Math.round(analysis.totalTokens / analysis.messageCount)}</span>
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Duplicates</span>
                          <span className="font-medium text-amber-600">{analysis.duplicateMessages}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Similar Exchanges</span>
                          <span className="font-medium text-amber-600">{analysis.similarExchanges}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Redundant Tools</span>
                          <span className="font-medium text-amber-600">{analysis.redundantToolCalls}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Optimization Opportunities */}
                {analysis.inefficientPatterns.length > 0 && (
                  <Card>
                    <CardContent className="p-4">
                      <h3 className="font-medium flex items-center gap-2 mb-3">
                        <Target className="h-4 w-4" />
                        Optimization Opportunities
                      </h3>
                      <div className="space-y-2">
                        {analysis.inefficientPatterns.slice(0, 4).map((pattern, index) => (
                          <motion.div
                            key={pattern}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.1 }}
                            className="flex items-center gap-2 text-sm"
                          >
                            <div className="w-2 h-2 bg-amber-500 rounded-full flex-shrink-0" />
                            <span className="text-muted-foreground">{pattern}</span>
                          </motion.div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Recommended Strategy Preview */}
                <Card className="border-primary/20 bg-primary/5">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <h3 className="font-medium text-primary">Recommended Strategy</h3>
                      <Badge variant="secondary">Smart</Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-background/50 p-3 rounded-md">
                        <div className="text-sm font-medium mb-1">Current State</div>
                        <div className="text-xs text-muted-foreground space-y-1">
                          <div>{analysis.messageCount} messages</div>
                          <div>{analysis.totalTokens.toLocaleString()} tokens</div>
                        </div>
                      </div>
                      <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-md border border-green-200 dark:border-green-800">
                        <div className="text-sm font-medium mb-1">After Optimization</div>
                        <div className="text-xs text-muted-foreground space-y-1">
                          <div>~{Math.round(analysis.messageCount * (1 - estimatedSavings / 100))} messages</div>
                          <div>~{Math.round(analysis.totalTokens * (1 - estimatedSavings / 100)).toLocaleString()} tokens</div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="strategies" className="space-y-4 mt-4">
                <RadioGroup value={selectedStrategy} onValueChange={setSelectedStrategy} className="space-y-3">
                  {COMPACTION_STRATEGIES.map((strategy) => (
                    <motion.div
                      key={strategy.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "relative rounded-lg border p-4 cursor-pointer transition-all",
                        selectedStrategy === strategy.id 
                          ? "border-primary bg-primary/5" 
                          : "border-muted hover:border-muted-foreground/50"
                      )}
                      onClick={() => setSelectedStrategy(strategy.id)}
                    >
                      <div className="flex items-start gap-3">
                        <RadioGroupItem value={strategy.id} id={strategy.id} className="mt-1" />
                        <strategy.icon className={cn(
                          "h-5 w-5 mt-0.5",
                          selectedStrategy === strategy.id ? "text-primary" : "text-muted-foreground"
                        )} />
                        
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <Label htmlFor={strategy.id} className="font-medium cursor-pointer">
                              {strategy.name}
                            </Label>
                            {strategy.recommended && (
                              <Badge variant="secondary" className="text-xs">
                                <Sparkles className="h-3 w-3 mr-1" />
                                Recommended
                              </Badge>
                            )}
                            <Badge 
                              variant="outline" 
                              className={cn(
                                "text-xs",
                                strategy.preservationLevel === "high" && "text-green-600 border-green-200",
                                strategy.preservationLevel === "medium" && "text-yellow-600 border-yellow-200",
                                strategy.preservationLevel === "low" && "text-red-600 border-red-200"
                              )}
                            >
                              {strategy.preservationLevel.toUpperCase()} preservation
                            </Badge>
                          </div>
                          
                          <p className="text-sm text-muted-foreground">{strategy.description}</p>
                          
                          <div className="grid grid-cols-2 gap-4 text-xs">
                            <div>
                              <div className="font-medium text-green-600 mb-1">Features:</div>
                              <ul className="space-y-1">
                                {strategy.features.map((feature, index) => (
                                  <li key={index} className="flex items-center gap-1">
                                    <CheckCircle2 className="h-2 w-2 text-green-500" />
                                    <span className="text-muted-foreground">{feature}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                            
                            <div>
                              <div className="font-medium text-amber-600 mb-1">Considerations:</div>
                              <ul className="space-y-1">
                                {strategy.risks.map((risk, index) => (
                                  <li key={index} className="flex items-center gap-1">
                                    <Info className="h-2 w-2 text-amber-500" />
                                    <span className="text-muted-foreground">{risk}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-between pt-2 border-t border-muted">
                            <span className="text-xs text-muted-foreground">Estimated savings:</span>
                            <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400">
                              <TrendingDown className="h-3 w-3 mr-1" />
                              ~{analysis.estimatedSavingsByStrategy[strategy.id] || strategy.estimatedSavings}%
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </RadioGroup>
              </TabsContent>

              <TabsContent value="options" className="space-y-4 mt-4">
                {/* Preservation Options */}
                <Card>
                  <CardContent className="p-4">
                    <h3 className="font-medium flex items-center gap-2 mb-3">
                      <Shield className="h-4 w-4" />
                      Content Preservation
                    </h3>
                    <div className="space-y-3">
                      {[
                        { key: "preserveToolOutputs", label: "Preserve tool outputs", description: "Keep detailed tool execution results" },
                        { key: "preserveCodeBlocks", label: "Preserve code blocks", description: "Maintain all code examples and snippets" },
                        { key: "preserveFileReferences", label: "Preserve file references", description: "Keep all file paths and references intact" }
                      ].map(({ key, label, description }) => (
                        <div key={key} className="flex items-center space-x-2">
                          <Checkbox
                            id={key}
                            checked={options[key as keyof CompactionOptions] as boolean}
                            onCheckedChange={(checked) => 
                              setOptions(prev => ({ ...prev, [key]: checked }))
                            }
                          />
                          <div className="grid gap-1.5 leading-none">
                            <Label htmlFor={key} className="text-sm font-medium cursor-pointer">
                              {label}
                            </Label>
                            <p className="text-xs text-muted-foreground">{description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Safety Options */}
                <Card>
                  <CardContent className="p-4">
                    <h3 className="font-medium flex items-center gap-2 mb-3">
                      <Package className="h-4 w-4" />
                      Safety & Notifications
                    </h3>
                    <div className="space-y-3">
                      {[
                        { key: "createBackup", label: "Create backup before compaction", description: "Save original conversation state for rollback" },
                        { key: "notifyOnCompletion", label: "Notify when complete", description: "Show notification when compaction finishes" }
                      ].map(({ key, label, description }) => (
                        <div key={key} className="flex items-center space-x-2">
                          <Checkbox
                            id={key}
                            checked={options[key as keyof CompactionOptions] as boolean}
                            onCheckedChange={(checked) => 
                              setOptions(prev => ({ ...prev, [key]: checked }))
                            }
                          />
                          <div className="grid gap-1.5 leading-none">
                            <Label htmlFor={key} className="text-sm font-medium cursor-pointer">
                              {label}
                            </Label>
                            <p className="text-xs text-muted-foreground">{description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Risk Assessment */}
                <Card className={cn(
                  "border",
                  analysis.riskLevel === "low" && "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20",
                  analysis.riskLevel === "medium" && "border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20",
                  analysis.riskLevel === "high" && "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20"
                )}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className={cn(
                        "h-4 w-4",
                        analysis.riskLevel === "low" && "text-green-500",
                        analysis.riskLevel === "medium" && "text-yellow-500",
                        analysis.riskLevel === "high" && "text-red-500"
                      )} />
                      <h3 className="font-medium">Risk Assessment</h3>
                      <Badge className={getRiskLevelColor(analysis.riskLevel)}>
                        {analysis.riskLevel.toUpperCase()} RISK
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {analysis.riskLevel === "low" && "This conversation is safe to compact with minimal risk of information loss."}
                      {analysis.riskLevel === "medium" && "Some context may be simplified during compaction. Review settings above."}
                      {analysis.riskLevel === "high" && "This conversation contains complex patterns. Consider conservative options."}
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>
            </div>
          </Tabs>
        </div>

        <DialogFooter className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>Estimated processing time: 10-30 seconds</span>
          </div>
          
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCompacting}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={isCompacting} className="gap-2">
              {isCompacting ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Compacting...
                </>
              ) : (
                <>
                  <Minimize2 className="h-4 w-4" />
                  Start Optimization
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};