"use client";

import { SearchIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { LogoMark } from "@/components/layout/logo";
import { useTeamSearch } from "@/components/search/team-search-provider";
import { Kbd } from "@/components/ui/kbd";
import { GITHUB_URL } from "@/lib/config/site";
import { cn } from "@/lib/utils";

function GitHubIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export function SiteHeader() {
  const { openTeamSearch, closeToLanding } = useTeamSearch();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b transition-[background-color,border-color] duration-200",
        scrolled
          ? "border-border bg-background/80 backdrop-blur-md"
          : "border-transparent bg-background",
      )}
    >
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
            href="/"
            onClick={closeToLanding}
            className="-mx-1.5 flex items-center gap-2 rounded-md px-1.5 py-1 text-sm font-semibold tracking-tight text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <LogoMark />
            SportsCal
          </Link>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openTeamSearch}
            className="flex h-8 items-center gap-2 rounded-full border border-border bg-card pr-1.5 pl-3 text-sm text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:w-56"
          >
            <SearchIcon className="size-3.5" aria-hidden="true" />
            <span className="flex-1 text-left">
              Find a team<span className="hidden sm:inline">…</span>
            </span>
            <Kbd className="hidden rounded-full sm:inline-flex">⌘K</Kbd>
          </button>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="SportsCal on GitHub"
            className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <GitHubIcon />
          </a>
        </div>
      </div>
    </header>
  );
}
