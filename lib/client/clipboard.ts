import { toast } from "sonner";

export async function copyText(text: string, successMessage: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(successMessage);
  } catch {
    toast.error("Couldn't copy automatically — select the text and copy it manually.");
  }
}

/** Absolute URL for a path, preferring the configured public origin. */
export function publicUrl(path: string): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
  const origin = configured || (typeof window !== "undefined" ? window.location.origin : "");
  return `${origin}${path}`;
}
