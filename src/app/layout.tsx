import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import { NavigationProgressProvider } from "@/components/layout/NavigationProgressContext";
import { NavigationProgressBar } from "@/components/layout/NavigationProgressBar";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "CardMax — Sri Lanka Credit Card Offers",
  description:
    "Browse credit card deals from all major Sri Lankan banks — updated daily.",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const publisherId = process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID;
  const adsenseEnabled = process.env.NEXT_PUBLIC_ADSENSE_ENABLED === "true";

  return (
    <html lang="en" suppressHydrationWarning className={cn("h-full antialiased", geist.variable, geistMono.variable)}>
      <head>
        {/* Preconnect to external image CDNs used by offer card logos — reduces DNS lookup latency for LCP images */}
        <link rel="preconnect" href="https://logo.clearbit.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="//logo.clearbit.com" />
        <link rel="dns-prefetch" href="//s3.amazonaws.com" />
        <link rel="dns-prefetch" href="//cloudfront.net" />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        {adsenseEnabled && publisherId && (
          <Script
            id="adsense-script"
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${publisherId}`}
            crossOrigin="anonymous"
            strategy="afterInteractive"
          />
        )}
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          storageKey="theme"
          disableTransitionOnChange
        >
          <NavigationProgressProvider>
            <NavigationProgressBar />
            <TooltipProvider>{children}</TooltipProvider>
          </NavigationProgressProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
