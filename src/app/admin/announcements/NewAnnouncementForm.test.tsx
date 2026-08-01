import { render, screen, fireEvent, waitFor } from "@/test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NewAnnouncementForm } from "./NewAnnouncementForm";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

const mockFetch = vi.fn();

describe("NewAnnouncementForm", () => {
  beforeEach(() => {
    mockRefresh.mockClear();
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  it("submits the message and refreshes on success", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    render(<NewAnnouncementForm />);
    fireEvent.change(screen.getByTestId("announcement-admin-message-input"), {
      target: { value: "New announcement" },
    });
    fireEvent.click(screen.getByTestId("announcement-admin-submit"));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith(
      "/api/announcements",
      expect.objectContaining({ method: "POST" }),
    ));
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  it("shows an error message when the request fails", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "Invalid input" }),
    });

    render(<NewAnnouncementForm />);
    fireEvent.change(screen.getByTestId("announcement-admin-message-input"), {
      target: { value: "Bad input" },
    });
    fireEvent.click(screen.getByTestId("announcement-admin-submit"));

    expect(await screen.findByText("Invalid input")).toBeInTheDocument();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("submit button is disabled when message is empty", () => {
    render(<NewAnnouncementForm />);
    expect(screen.getByTestId("announcement-admin-submit")).toBeDisabled();
  });
});
