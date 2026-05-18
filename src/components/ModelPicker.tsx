import { Cpu, Cloud, Sparkles } from "lucide-react";
import type { PluginAiModelId, PluginAiModelInfo } from "@alt/plugin-sdk";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface ModelPickerProps {
  models: PluginAiModelInfo[];
  value: PluginAiModelId;
  onChange: (next: PluginAiModelId) => void;
  /** Local model has no tool support — quiz tool calls would fail. */
  toolsRequired?: boolean;
}

const ICONS: Record<PluginAiModelInfo["provider"], React.ReactNode> = {
  cloud: <Sparkles className="h-3 w-3" />,
  auto: <Cloud className="h-3 w-3" />,
  local: <Cpu className="h-3 w-3" />,
};

export function ModelPicker({
  models,
  value,
  onChange,
  toolsRequired = true,
}: ModelPickerProps) {
  return (
    <Select
      value={value}
      onValueChange={next => onChange(next as PluginAiModelId)}
    >
      <SelectTrigger
        size="sm"
        data-testid="model-picker-trigger"
        className="h-7 gap-1 border-border/60 bg-transparent px-2 text-xs"
      >
        <SelectValue placeholder="Model" />
      </SelectTrigger>
      <SelectContent align="start">
        {models.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            No models available
          </div>
        ) : (
          models.map(model => {
            const disabled =
              model.availability !== "ready" ||
              (toolsRequired && !model.supportsTools);
            return (
              <SelectItem
                key={model.id}
                value={model.id}
                disabled={disabled}
                data-testid={`model-picker-option-${model.id}`}
              >
                <span className="flex items-center gap-2">
                  <span className="text-muted-foreground">
                    {ICONS[model.provider]}
                  </span>
                  <span>{model.name}</span>
                  {disabled && (
                    <span className="text-[10px] text-muted-foreground">
                      {toolsRequired && !model.supportsTools
                        ? "no tools"
                        : "unavailable"}
                    </span>
                  )}
                </span>
              </SelectItem>
            );
          })
        )}
      </SelectContent>
    </Select>
  );
}
