import { Logo } from "@/components/brand/Logo";

export function Footer() {
  return (
    <footer className="border-t border-border bg-muted" data-testid="site-footer">
      <div className="mx-auto flex max-w-screen-2xl flex-col items-center justify-between gap-6 px-12 py-12 md:flex-row">
        <div className="flex flex-col items-center gap-3 md:items-start">
          <Logo variant="horizontal" className="h-6" />
          <p className="text-center text-sm text-foreground/70 md:text-left" data-testid="footer-tagline">
            Sri Lanka&apos;s Credit Card Offers Aggregator
          </p>
        </div>
        <nav
          className="flex gap-8 text-sm text-foreground/70"
          aria-label="Footer links"
          data-testid="footer-links"
        >
          <span>Privacy</span>
          <span>Terms</span>
          <span>Support</span>
        </nav>
      </div>
    </footer>
  );
}
