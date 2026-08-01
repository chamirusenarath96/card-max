import { render, screen, fireEvent, waitFor } from "@/test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AnnouncementRowActions } from "./AnnouncementRowActions";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

const mockFetch = vi.fn();

describe("AnnouncementRowActions", () => {
  beforeEach(() => {
    mockRefresh.mockClear();
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  it("shows Activate for an inactive announcement and PATCHes active:true on click", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    render(<AnnouncementRowActions id="ann-1" initialActive={false} />);
    expect(screen.getByTestId("announcement-toggle-ann-1")).toHaveTextContent("Activate");

    fireEvent.click(screen.getByTestId("announcement-toggle-ann-1"));

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/announcements/ann-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ active: true }),
        }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId("announcement-toggle-ann-1")).toHaveTextContent("Deactivate"),
    );
  });

  it("shows Deactivate for an active announcement and PATCHes active:false on click", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    render(<AnnouncementRowActions id="ann-2" initialActive={true} />);
    fireEvent.click(screen.getByTestId("announcement-toggle-ann-2"));

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/announcements/ann-2",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ active: false }),
        }),
      ),
    );
  });

  it("shows an error message when the update fails", async () => {
    mockFetch.mockResolvedValue({ ok: false, json: () => Promise.resolve({ error: "Failed" }) });

    render(<AnnouncementRowActions id="ann-3" initialActive={false} />);
    fireEvent.click(screen.getByTestId("announcement-toggle-ann-3"));

    expect(await screen.findByText("Failed")).toBeInTheDocument();
  });
});
