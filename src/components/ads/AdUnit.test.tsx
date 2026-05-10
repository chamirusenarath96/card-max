import { render, screen } from "@/test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AdUnit } from "./AdUnit";

describe("AdUnit", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_ADSENSE_PUBLISHER_ID", "ca-pub-1234567890");
  });

  it("renders the ad unit wrapper with data-testid", () => {
    render(<AdUnit slotId="1234567890" />);
    expect(screen.getByTestId("ad-unit")).toBeInTheDocument();
  });

  it("renders ins element with correct ad-client and ad-slot", () => {
    render(<AdUnit slotId="9876543210" />);
    const ins = document.querySelector("ins.adsbygoogle") as HTMLElement;
    expect(ins).not.toBeNull();
    expect(ins.getAttribute("data-ad-client")).toBe("ca-pub-1234567890");
    expect(ins.getAttribute("data-ad-slot")).toBe("9876543210");
  });

  it("uses provided format", () => {
    render(<AdUnit slotId="111" format="rectangle" />);
    const ins = document.querySelector("ins.adsbygoogle") as HTMLElement;
    expect(ins.getAttribute("data-ad-format")).toBe("rectangle");
  });

  it("defaults to auto format", () => {
    render(<AdUnit slotId="222" />);
    const ins = document.querySelector("ins.adsbygoogle") as HTMLElement;
    expect(ins.getAttribute("data-ad-format")).toBe("auto");
  });

  it("returns null when NEXT_PUBLIC_ADSENSE_PUBLISHER_ID is not set", () => {
    vi.stubEnv("NEXT_PUBLIC_ADSENSE_PUBLISHER_ID", "");
    const { container } = render(<AdUnit slotId="333" />);
    expect(container.firstChild).toBeNull();
  });

  it("applies extra className to wrapper", () => {
    render(<AdUnit slotId="444" className="sticky top-4" />);
    const wrapper = screen.getByTestId("ad-unit");
    expect(wrapper.className).toContain("sticky");
    expect(wrapper.className).toContain("top-4");
  });
});
