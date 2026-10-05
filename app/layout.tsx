import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

import { SiteHeader } from "@/components/layout/site-header";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { appUrl } from "@/lib/utils/urls";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl()),
  title: {
    default: "SportsCal — Clean sports schedules for your calendar",
    template: "%s · SportsCal",
  },
  description:
    "Pick a team from the NFL, NBA, NHL, MLB, college football, Premier League and more, then download or subscribe to a clean, customizable .ics calendar.",
  applicationName: "SportsCal",
  openGraph: {
    title: "SportsCal",
    description: "Clean sports schedules for your calendar.",
    siteName: "SportsCal",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`dark ${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <TooltipProvider delayDuration={300}>
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <Toaster position="bottom-right" />
        </TooltipProvider>
      </body>
    </html>
  );
}
