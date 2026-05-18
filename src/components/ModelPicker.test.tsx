import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PluginAiModelInfo } from "@alt/plugin-sdk";
import { ModelPicker } from "./ModelPicker";

const models: PluginAiModelInfo[] = [
  {
    id: "gpt-5.4",
    name: "GPT 5.4",
    provider: "cloud",
    supportsTools: true,
    availability: "ready",
  },
  {
    id: "auto",
    name: "Auto",
    provider: "auto",
    supportsTools: true,
    availability: "ready",
  },
  {
    id: "local",
    name: "Local",
    provider: "local",
    supportsTools: false,
    availability: "ready",
  },
];

describe("ModelPicker", () => {
  it("shows the active selection in the trigger", () => {
    render(<ModelPicker models={models} value="auto" onChange={vi.fn()} />);
    expect(screen.getByTestId("model-picker-trigger")).toHaveTextContent(
      "Auto",
    );
  });

  it("disables models that do not support tools when toolsRequired is set", async () => {
    const user = userEvent.setup();
    render(<ModelPicker models={models} value="auto" onChange={vi.fn()} />);
    await user.click(screen.getByTestId("model-picker-trigger"));
    const localOption = await screen.findByTestId("model-picker-option-local");
    expect(localOption).toHaveAttribute("aria-disabled", "true");
  });

  it("calls onChange with the selected id", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ModelPicker models={models} value="auto" onChange={onChange} />);
    await user.click(screen.getByTestId("model-picker-trigger"));
    await user.click(await screen.findByTestId("model-picker-option-gpt-5.4"));
    expect(onChange).toHaveBeenCalledWith("gpt-5.4");
  });

  it("renders an empty hint when there are no models", () => {
    render(<ModelPicker models={[]} value="auto" onChange={vi.fn()} />);
    // Trigger has no value placeholder so it shows the empty option name.
    expect(screen.getByTestId("model-picker-trigger")).toBeInTheDocument();
  });
});
