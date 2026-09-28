import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-24 text-center">
      <h1 className="text-xl font-semibold text-foreground">Page not found</h1>
      <p className="text-sm text-muted-foreground">
        This page or saved calendar doesn&apos;t exist. It may have been deleted.
      </p>
      <Link href="/" className="text-sm text-foreground underline underline-offset-2">
        Build a calendar
      </Link>
    </div>
  );
}
