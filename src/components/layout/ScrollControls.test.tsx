import { render, screen, fireEvent, act } from "@/test-utils";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We must set up IntersectionObserver mock before importing the component
let observerCallback: IntersectionObserverCallback = () => {};
const mockObserve = vi.fn();
const mockDisconnect = vi.fn();

beforeEach(() => {
  mockObserve.mockClear();
  mockDisconnect.mockClear();

  vi.stubGlobal(
    "IntersectionObserver",
    vi.fn((cb: IntersectionObserverCallback) => {
      observerCallback = cb;
      return { observe: mockObserve, disconnect: mockDisconnect, unobserve: vi.fn() };
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

import { ScrollControls } from "./ScrollControls";

function makeEntry(opts: {
  isIntersecting: boolean;
  top: number;
}): IntersectionObserverEntry {
  return {
    isIntersecting: opts.isIntersecting,
    boundingClientRect: {
      top: opts.top,
      bottom: opts.top + 400,
      left: 0,
      right: 800,
      width: 800,
      height: 400,
      x: 0,
      y: opts.top,
      toJSON: () => ({}),
    } as DOMRectReadOnly,
    intersectionRatio: opts.isIntersecting ? 1 : 0,
    intersectionRect: {} as DOMRectReadOnly,
    rootBounds: null,
    target: document.createElement("div"),
    time: 0,
  } as IntersectionObserverEntry;
}

describe("ScrollControls", () => {
  it("renders scroll-to-grid-btn with correct data-testid", () => {
    render(<ScrollControls />);
    expect(screen.getByTestId("scroll-to-grid-btn")).toBeInTheDocument();
  });

  it("renders scroll-to-top-btn with correct data-testid", () => {
    render(<ScrollControls />);
    expect(screen.getByTestId("scroll-to-top-btn")).toBeInTheDocument();
  });

  it("buttons have correct data-testid attributes (AC5, AC6, AC7)", () => {
    render(<ScrollControls />);
    expect(screen.getByTestId("scroll-to-grid-btn")).toHaveAttribute("data-testid", "scroll-to-grid-btn");
    expect(screen.getByTestId("scroll-to-top-btn")).toHaveAttribute("data-testid", "scroll-to-top-btn");
  });

  it("scroll-to-grid button is visible (opacity-100) when grid is below viewport", () => {
    render(
      <>
        <div data-testid="offer-grid" />
        <ScrollControls />
      </>,
    );

    act(() => {
      observerCallback([makeEntry({ isIntersecting: false, top: 500 })], {} as IntersectionObserver);
    });

    expect(screen.getByTestId("scroll-to-grid-btn")).toHaveClass("opacity-100");
    expect(screen.getByTestId("scroll-to-top-btn")).toHaveClass("opacity-0");
  });

  it("scroll-to-top button is visible (opacity-100) when grid is above viewport", () => {
    render(
      <>
        <div data-testid="offer-grid" />
        <ScrollControls />
      </>,
    );

    act(() => {
      observerCallback([makeEntry({ isIntersecting: false, top: -500 })], {} as IntersectionObserver);
    });

    expect(screen.getByTestId("scroll-to-top-btn")).toHaveClass("opacity-100");
    expect(screen.getByTestId("scroll-to-grid-btn")).toHaveClass("opacity-0");
  });

  it("both buttons have opacity-0 when grid is visible in viewport", () => {
    render(
      <>
        <div data-testid="offer-grid" />
        <ScrollControls />
      </>,
    );

    act(() => {
      observerCallback([makeEntry({ isIntersecting: true, top: 100 })], {} as IntersectionObserver);
    });

    expect(screen.getByTestId("scroll-to-grid-btn")).toHaveClass("opacity-0");
    expect(screen.getByTestId("scroll-to-top-btn")).toHaveClass("opacity-0");
  });

  it("scroll-to-grid button calls scrollIntoView on click", () => {
    const mockScrollIntoView = vi.fn();
    render(
      <>
        <div data-testid="offer-grid" />
        <ScrollControls />
      </>,
    );

    // Make the grid element's scrollIntoView mockable
    const gridEl = document.querySelector('[data-testid="offer-grid"]');
    if (gridEl) {
      gridEl.scrollIntoView = mockScrollIntoView;
    }

    // Make the button visible (grid below viewport)
    act(() => {
      observerCallback([makeEntry({ isIntersecting: false, top: 500 })], {} as IntersectionObserver);
    });

    fireEvent.click(screen.getByTestId("scroll-to-grid-btn"));
    expect(mockScrollIntoView).toHaveBeenCalledWith({ behavior: "smooth" });
  });

  it("scroll-to-top button calls window.scrollTo on click", () => {
    const mockScrollTo = vi.fn();
    vi.stubGlobal("scrollTo", mockScrollTo);

    render(
      <>
        <div data-testid="offer-grid" />
        <ScrollControls />
      </>,
    );

    // Make the scroll-to-top button visible (grid above viewport)
    act(() => {
      observerCallback([makeEntry({ isIntersecting: false, top: -500 })], {} as IntersectionObserver);
    });

    fireEvent.click(screen.getByTestId("scroll-to-top-btn"));
    expect(mockScrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  });

  it("does not set up observer when IntersectionObserver is unavailable", () => {
    vi.stubGlobal("IntersectionObserver", undefined);

    // Should render without throwing
    expect(() => render(<ScrollControls />)).not.toThrow();
    expect(screen.getByTestId("scroll-to-grid-btn")).toBeInTheDocument();
  });
});
