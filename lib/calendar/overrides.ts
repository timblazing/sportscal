import type { GameOverride } from "@/lib/validation/calendar-config";

export interface ResolvedEventFields {
  title: string;
  description: string;
  location: string;
  durationMinutes: number;
  excluded: boolean;
}

/**
 * Overrides are partial: only fields the user explicitly overrode replace the
 * globally templated values, so later template changes still apply elsewhere.
 */
export function applyOverride(
  base: ResolvedEventFields,
  override: GameOverride | undefined,
): ResolvedEventFields & { overridden: boolean } {
  if (!override) return { ...base, overridden: false };
  const merged: ResolvedEventFields = {
    title: override.title ?? base.title,
    description: override.description ?? base.description,
    location: override.location ?? base.location,
    durationMinutes: override.durationMinutes ?? base.durationMinutes,
    excluded: override.excluded ?? base.excluded,
  };
  const overridden =
    override.title !== undefined ||
    override.description !== undefined ||
    override.location !== undefined ||
    override.durationMinutes !== undefined ||
    override.excluded === true;
  return { ...merged, overridden };
}

export function hasOverride(override: GameOverride | undefined): boolean {
  return applyOverride(
    { title: "", description: "", location: "", durationMinutes: 0, excluded: false },
    override,
  ).overridden;
}
