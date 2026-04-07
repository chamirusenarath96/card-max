/**
 * Custom render helper that wraps components with all required providers.
 * Use this instead of @testing-library/react's render in component tests.
 */
import { type ReactElement } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";

function AllProviders({ children }: { children: React.ReactNode }) {
  return <TooltipProvider>{children}</TooltipProvider>;
}

function customRender(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  return render(ui, { wrapper: AllProviders, ...options });
}

// Re-export everything from testing-library so tests only need one import
export * from "@testing-library/react";
export { customRender as render };
