import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="max-w-2xl text-pretty">
          Schedule data sourced from ESPN public endpoints. SportsCal is not affiliated with or
          endorsed by ESPN or the leagues/teams listed.
        </p>
        <Link href="/about" className="shrink-0 hover:text-foreground">
          About &amp; data source
        </Link>
      </div>
    </footer>
  );
}
