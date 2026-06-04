import { render, screen, fireEvent, waitFor } from "@/test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FeedbackWidget } from "./FeedbackWidget";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("FeedbackWidget", () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it("renders the feedback section and trigger button", () => {
    render(<FeedbackWidget />);
    expect(screen.getByTestId("feedback-section")).toBeInTheDocument();
    expect(screen.getByTestId("feedback-trigger")).toBeInTheDocument();
  });

  it("opens the dialog when trigger is clicked", async () => {
    render(<FeedbackWidget />);
    fireEvent.click(screen.getByTestId("feedback-trigger"));
    expect(await screen.findByTestId("feedback-dialog")).toBeInTheDocument();
  });

  it("shows all three type selector buttons", async () => {
    render(<FeedbackWidget />);
    fireEvent.click(screen.getByTestId("feedback-trigger"));
    expect(await screen.findByTestId("feedback-type-suggestion")).toBeInTheDocument();
    expect(screen.getByTestId("feedback-type-bug")).toBeInTheDocument();
    expect(screen.getByTestId("feedback-type-other")).toBeInTheDocument();
  });

  it("shows validation error when message is too short", async () => {
    render(<FeedbackWidget />);
    fireEvent.click(screen.getByTestId("feedback-trigger"));
    await screen.findByTestId("feedback-dialog");
    fireEvent.change(screen.getByTestId("feedback-message"), { target: { value: "short" } });
    fireEvent.click(screen.getByTestId("feedback-submit"));
    expect(await screen.findByTestId("feedback-error")).toBeInTheDocument();
  });

  it("calls POST /api/feedback with correct payload on submit", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, id: "1" }) });
    render(<FeedbackWidget />);
    fireEvent.click(screen.getByTestId("feedback-trigger"));
    await screen.findByTestId("feedback-dialog");

    fireEvent.click(screen.getByTestId("feedback-type-bug"));
    fireEvent.change(screen.getByTestId("feedback-message"), {
      target: { value: "The Sampath Bank offers section shows wrong dates." },
    });
    fireEvent.change(screen.getByTestId("feedback-email"), {
      target: { value: "user@test.com" },
    });
    fireEvent.click(screen.getByTestId("feedback-submit"));

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/feedback");
    const body = JSON.parse(opts.body as string) as { type: string; message: string; email: string };
    expect(body.type).toBe("bug");
    expect(body.message).toContain("Sampath");
    expect(body.email).toBe("user@test.com");
  });

  it("shows success state after successful submission", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, id: "1" }) });
    render(<FeedbackWidget />);
    fireEvent.click(screen.getByTestId("feedback-trigger"));
    await screen.findByTestId("feedback-dialog");
    fireEvent.change(screen.getByTestId("feedback-message"), {
      target: { value: "Great site, please add more banks!" },
    });
    fireEvent.click(screen.getByTestId("feedback-submit"));
    expect(await screen.findByTestId("feedback-success")).toBeInTheDocument();
  });

  it("shows error message on failed submission", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Server error" }) });
    render(<FeedbackWidget />);
    fireEvent.click(screen.getByTestId("feedback-trigger"));
    await screen.findByTestId("feedback-dialog");
    fireEvent.change(screen.getByTestId("feedback-message"), {
      target: { value: "This is a long enough feedback message." },
    });
    fireEvent.click(screen.getByTestId("feedback-submit"));
    expect(await screen.findByTestId("feedback-error")).toBeInTheDocument();
  });
});
