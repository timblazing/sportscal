import { LogoMark } from "@/components/layout/logo";
import { GITHUB_URL } from "@/lib/config/site";

function GitHubIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-7xl px-4 pt-16 pb-10 sm:px-6">
      <div className="flex items-end justify-between gap-6">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
            <LogoMark />
            SportsCal
          </div>
          <p className="max-w-sm text-sm text-pretty text-muted-foreground">Team schedules for the calendar app you already use.</p>
        </div>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="SportsCal on GitHub"
          className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <GitHubIcon />
        </a>
      </div>
      <div className="mt-12 flex flex-col gap-2 text-xs leading-relaxed text-muted-foreground/70 sm:flex-row sm:justify-between sm:gap-8">
        <p className="max-w-xl text-pretty">
          Schedule data comes from ESPN’s public endpoints. SportsCal isn’t affiliated with or endorsed by ESPN or any
          league or team.
        </p>
        <p className="shrink-0">Open source under the MIT license.</p>
      </div>
    </footer>
  );
}
