import { toast } from "sonner";

export async function copyText(text: string, successMessage: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(successMessage);
  } catch {
    toast.error("Couldn't copy automatically — select the text and copy it manually.");
  }
}

/** Absolute URL for a path on the origin the visitor is using. */
export function publicUrl(path: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}${path}`;
}
