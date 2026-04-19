import { render, screen, fireEvent } from "@/test-utils";
import { describe, it, expect, vi } from "vitest";
import { SavePresetPopover } from "./SavePresetPopover";

const FILTERS = { bank: "hnb", category: "dining" };

describe("SavePresetPopover", () => {
  it("renders the save filters button", () => {
    render(<SavePresetPopover filters={FILTERS} onSave={vi.fn()} />);
    expect(screen.getByTestId("save-preset-button")).toBeInTheDocument();
  });

  it("opens popover on button click", async () => {
    render(<SavePresetPopover filters={FILTERS} onSave={vi.fn()} />);
    fireEvent.click(screen.getByTestId("save-preset-button"));
    expect(await screen.findByTestId("save-preset-popover")).toBeInTheDocument();
  });

  it("calls onSave with name and filters on confirm", async () => {
    const onSave = vi.fn();
    render(<SavePresetPopover filters={FILTERS} onSave={onSave} />);
    fireEvent.click(screen.getByTestId("save-preset-button"));
    const input = await screen.findByTestId("preset-name-input");
    fireEvent.change(input, { target: { value: "My Preset" } });
    fireEvent.click(screen.getByTestId("save-preset-confirm"));
    expect(onSave).toHaveBeenCalledWith("My Preset", FILTERS);
  });

  it("calls onSave on Enter key press", async () => {
    const onSave = vi.fn();
    render(<SavePresetPopover filters={FILTERS} onSave={onSave} />);
    fireEvent.click(screen.getByTestId("save-preset-button"));
    const input = await screen.findByTestId("preset-name-input");
    fireEvent.change(input, { target: { value: "Quick save" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSave).toHaveBeenCalledWith("Quick save", FILTERS);
  });

  it("does not call onSave when name is empty", async () => {
    const onSave = vi.fn();
    render(<SavePresetPopover filters={FILTERS} onSave={onSave} />);
    fireEvent.click(screen.getByTestId("save-preset-button"));
    await screen.findByTestId("save-preset-popover");
    fireEvent.click(screen.getByTestId("save-preset-confirm"));
    expect(onSave).not.toHaveBeenCalled();
  });
});
