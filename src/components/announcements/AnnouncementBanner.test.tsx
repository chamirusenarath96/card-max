import { render, screen, waitFor, fireEvent } from "@/test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AnnouncementBanner } from "./AnnouncementBanner";

const mockFetch = vi.fn();

function mockActiveResponse(data: unknown) {
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ data }),
  });
}

describe("AnnouncementBanner", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
    localStorage.clear();
  });

  it("renders message when an active announcement is returned", async () => {
    mockActiveResponse({ _id: "ann-1", message: "Site update!" });
    render(<AnnouncementBanner />);

    expect(await screen.findByTestId("announcement-banner")).toBeInTheDocument();
    expect(screen.getByTestId("announcement-banner-message")).toHaveTextContent("Site update!");
  });

  it("renders link when linkUrl/linkLabel present", async () => {
    mockActiveResponse({
      _id: "ann-2",
      message: "New feature shipped",
      linkUrl: "https://example.com/changelog",
      linkLabel: "See what's new",
    });
    render(<AnnouncementBanner />);

    const link = await screen.findByTestId("announcement-banner-link");
    expect(link).toHaveAttribute("href", "https://example.com/changelog");
    expect(link).toHaveTextContent("See what's new");
  });

  it("clicking dismiss hides the banner", async () => {
    mockActiveResponse({ _id: "ann-3", message: "Dismiss me" });
    render(<AnnouncementBanner />);
    await screen.findByTestId("announcement-banner");

    fireEvent.click(screen.getByTestId("announcement-banner-dismiss"));

    await waitFor(() =>
      expect(screen.queryByTestId("announcement-banner")).not.toBeInTheDocument(),
    );
  });

  it("writes the dismissed announcement id to localStorage", async () => {
    mockActiveResponse({ _id: "ann-4", message: "Persist my dismissal" });
    render(<AnnouncementBanner />);
    await screen.findByTestId("announcement-banner");

    fireEvent.click(screen.getByTestId("announcement-banner-dismiss"));

    await waitFor(() =>
      expect(localStorage.getItem("card-max:dismissed-announcement")).toBe("ann-4"),
    );
  });

  it("does not render on remount when its id matches the stored dismissed id", async () => {
    localStorage.setItem("card-max:dismissed-announcement", "ann-5");
    mockActiveResponse({ _id: "ann-5", message: "Already dismissed" });
    render(<AnnouncementBanner />);

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(screen.queryByTestId("announcement-banner")).not.toBeInTheDocument();
  });

  it("renders for a new announcement id even when a different id is stored as dismissed", async () => {
    localStorage.setItem("card-max:dismissed-announcement", "old-id");
    mockActiveResponse({ _id: "new-id", message: "Fresh announcement" });
    render(<AnnouncementBanner />);

    expect(await screen.findByTestId("announcement-banner")).toBeInTheDocument();
  });

  it("renders nothing when the API returns no active announcement", async () => {
    mockActiveResponse(null);
    render(<AnnouncementBanner />);

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(screen.queryByTestId("announcement-banner")).not.toBeInTheDocument();
  });
});
