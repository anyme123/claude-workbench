import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { 
  X, 
  Command,
  Globe,
  FolderOpen,
  Zap,
  FileCode,
  Terminal,
  AlertCircle
} from "lucide-react";
import type { SlashCommand } from "@/lib/api";
import { cn } from "@/lib/utils";

interface SlashCommandPickerProps {
  /**
   * The project path for loading project-specific commands
   */
  projectPath?: string;
  /**
   * Callback when a command is selected
   */
  onSelect: (command: SlashCommand) => void;
  /**
   * Callback to close the picker
   */
  onClose: () => void;
  /**
   * Initial search query (text after /)
   */
  initialQuery?: string;
  /**
   * Optional className for styling
   */
  className?: string;
}

// Get icon for command based on its properties
const getCommandIcon = (command: SlashCommand) => {
  // If it has bash commands, show terminal icon
  if (command.has_bash_commands) return Terminal;
  
  // If it has file references, show file icon
  if (command.has_file_references) return FileCode;
  
  // If it accepts arguments, show zap icon
  if (command.accepts_arguments) return Zap;
  
  // Based on scope
  if (command.scope === "project") return FolderOpen;
  if (command.scope === "user") return Globe;
  
  // Default
  return Command;
};

/**
 * SlashCommandPicker component - Autocomplete UI for slash commands
 * 
 * @example
 * <SlashCommandPicker
 *   projectPath="/Users/example/project"
 *   onSelect={(command) => console.log('Selected:', command)}
 *   onClose={() => setShowPicker(false)}
 * />
 */
export const SlashCommandPicker: React.FC<SlashCommandPickerProps> = ({
  projectPath,
  onSelect,
  onClose,
  initialQuery = "",
  className,
}) => {
  const [commands, setCommands] = useState<SlashCommand[]>([]);
  const [filteredCommands, setFilteredCommands] = useState<SlashCommand[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const activeTab = "default";
  
  const commandListRef = useRef<HTMLDivElement>(null);
  
  // Load commands on mount or when project path changes
  useEffect(() => {
    loadCommands();
  }, [projectPath]);
  
  // Filter commands based on search query and active tab
  useEffect(() => {
    if (!commands.length) {
      setFilteredCommands([]);
      return;
    }
    
    const query = searchQuery.toLowerCase();
    let filteredByTab: SlashCommand[];
    
    // Show all commands (default, project, and user)
    filteredByTab = commands;
    
    // Then filter by search query
    let filtered: SlashCommand[];
    if (!query) {
      filtered = filteredByTab;
    } else {
      filtered = filteredByTab.filter(cmd => {
        // Match against command name
        if (cmd.name.toLowerCase().includes(query)) return true;
        
        // Match against full command
        if (cmd.full_command.toLowerCase().includes(query)) return true;
        
        // Match against namespace
        if (cmd.namespace && cmd.namespace.toLowerCase().includes(query)) return true;
        
        // Match against description
        if (cmd.description && cmd.description.toLowerCase().includes(query)) return true;
        
        return false;
      });
      
      // Sort by relevance
      filtered.sort((a, b) => {
        // Exact name match first
        const aExact = a.name.toLowerCase() === query;
        const bExact = b.name.toLowerCase() === query;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        
        // Then by name starts with
        const aStarts = a.name.toLowerCase().startsWith(query);
        const bStarts = b.name.toLowerCase().startsWith(query);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        
        // Then alphabetically
        return a.name.localeCompare(b.name);
      });
    }
    
    setFilteredCommands(filtered);
    
    // Reset selected index when filtered list changes
    setSelectedIndex(0);
  }, [searchQuery, commands, activeTab]);
  
  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
          
        case 'Enter':
          e.preventDefault();
          if (filteredCommands.length > 0 && selectedIndex < filteredCommands.length) {
            onSelect(filteredCommands[selectedIndex]);
          }
          break;
          
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => Math.max(0, prev - 1));
          break;
          
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => Math.min(filteredCommands.length - 1, prev + 1));
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredCommands, selectedIndex, onSelect, onClose]);
  
  // Scroll selected item into view
  useEffect(() => {
    if (commandListRef.current) {
      const selectedElement = commandListRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex]);
  
  const loadCommands = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Always load fresh commands from filesystem
      const loadedCommands = await api.slashCommandsList(projectPath);
      setCommands(loadedCommands);
    } catch (err) {
      console.error("Failed to load slash commands:", err);
      setError(err instanceof Error ? err.message : 'Failed to load commands');
      setCommands([]);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleCommandClick = (command: SlashCommand) => {
    onSelect(command);
  };
  
  
  // Update search query from parent
  useEffect(() => {
    setSearchQuery(initialQuery);
  }, [initialQuery]);
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={cn(
        "absolute bottom-full mb-2 left-0 z-50",
        "w-[600px] h-[400px]",
        "bg-background/95 backdrop-blur-sm border border-border rounded-lg shadow-lg",
        "dark:bg-background light:bg-white/98 light:backdrop-blur-md light:shadow-xl",
        "flex flex-col overflow-hidden",
        className
      )}
    >
      {/* Header */}
      <div className="border-b border-border p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Command className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Slash Commands</span>
            {searchQuery && (
              <span className="text-xs text-muted-foreground">
                Searching: "{searchQuery}"
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        {/* All Commands Header */}
        <div className="mt-3">
          <h3 className="text-sm font-medium text-muted-foreground px-1">All Commands</h3>
        </div>
      </div>

      {/* Command List */}
      <div className="flex-1 overflow-y-auto relative">
        {isLoading && (
          <div className="flex items-center justify-center h-full">
            <span className="text-sm text-muted-foreground">Loading commands...</span>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center h-full p-4">
            <AlertCircle className="h-8 w-8 text-destructive mb-2" />
            <span className="text-sm text-destructive text-center">{error}</span>
          </div>
        )}

        {!isLoading && !error && (
          <>
            {/* Default Tab Content */}
            {activeTab === "default" && (
              <>
                {filteredCommands.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full">
                    <Command className="h-8 w-8 text-muted-foreground mb-2" />
                    <span className="text-sm text-muted-foreground">
                      {searchQuery ? 'No commands found' : 'No commands available'}
                    </span>
                    {!searchQuery && (
                      <p className="text-xs text-muted-foreground mt-2 text-center px-4">
                        Commands include built-in, project, and user commands
                      </p>
                    )}
                  </div>
                )}

                {filteredCommands.length > 0 && (
                  <div className="p-2" ref={commandListRef}>
                    <div className="space-y-0.5">
                      {filteredCommands.map((command, index) => {
                        const Icon = getCommandIcon(command);
                        const isSelected = index === selectedIndex;
                        
                        return (
                          <button
                            key={command.id}
                            data-index={index}
                            onClick={() => handleCommandClick(command)}
                            onMouseEnter={() => setSelectedIndex(index)}
                            className={cn(
                              "w-full flex items-start gap-3 px-3 py-2 rounded-md",
                              "hover:bg-accent transition-colors",
                              "text-left",
                              isSelected && "bg-accent"
                            )}
                          >
                            <Icon className="h-4 w-4 text-muted-foreground mt-1 flex-shrink-0" />
                            <div className="flex-1 overflow-hidden">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">
                                  {command.full_command}
                                </span>
                                <span className={cn(
                                  "text-xs px-1.5 py-0.5 rounded text-white font-medium",
                                  command.scope === "default" && "bg-blue-500",
                                  command.scope === "project" && "bg-green-500", 
                                  command.scope === "user" && "bg-purple-500"
                                )}>
                                  {command.scope}
                                </span>
                              </div>
                              {command.description && (
                                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                                  {command.description}
                                </p>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border p-2">
        <p className="text-xs text-muted-foreground text-center">
          ↑↓ Navigate • Enter Select • Esc Close
        </p>
      </div>
    </motion.div>
  );
}; 