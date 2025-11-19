import React from "react";
import { ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ModelType, ModelConfig } from "./types";
import { MODELS } from "./constants";

interface ModelSelectorProps {
  selectedModel: ModelType;
  onModelChange: (model: ModelType) => void;
  disabled?: boolean;
  availableModels?: ModelConfig[];
}

/**
 * ModelSelector component - Dropdown for selecting AI model
 */
export const ModelSelector: React.FC<ModelSelectorProps> = ({
  selectedModel,
  onModelChange,
  disabled = false,
  availableModels = MODELS
}) => {
  const [open, setOpen] = React.useState(false);
  const selectedModelData = availableModels.find(m => m.id === selectedModel) || availableModels[0];

  return (
    <Popover
      trigger={
        <Button
          variant="outline"
          size="default"
          disabled={disabled}
          className="gap-2 min-w-[180px] justify-start"
        >
          {selectedModelData.icon}
          <span className="flex-1 text-left">{selectedModelData.name}</span>
          <ChevronUp className="h-4 w-4 opacity-50" />
        </Button>
      }
      content={
        <div className="w-[300px] p-1">
          {availableModels.map((model) => (
            <button
              key={model.id}
              onClick={() => {
                onModelChange(model.id);
                setOpen(false);
              }}
              className={cn(
                "w-full flex items-start gap-3 p-3 rounded-md transition-colors text-left",
                "hover:bg-accent",
                selectedModel === model.id && "bg-accent"
              )}
            >
              <div className="mt-0.5">{model.icon}</div>
              <div className="flex-1 space-y-1">
                <div className="font-medium text-sm">{model.name}</div>
                <div className="text-xs text-muted-foreground">
                  {model.description}
                </div>
              </div>
            </button>
          ))}
        </div>
      }
      open={open}
      onOpenChange={setOpen}
      align="start"
      side="top"
    />
  );
};
