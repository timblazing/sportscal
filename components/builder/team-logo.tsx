"use client";

import Image from "next/image";
import { useState } from "react";

import { cn } from "@/lib/utils";

/** Decorative team logo. A missing or broken logo falls back to the abbreviation. */
export function TeamLogo({
  src,
  abbreviation,
  size = 20,
  className,
}: {
  src?: string;
  abbreviation: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span
        aria-hidden="true"
        style={{ width: size, height: size }}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-sm bg-secondary font-mono text-[9px] font-medium text-muted-foreground",
          className,
        )}
      >
        {abbreviation.slice(0, 3)}
      </span>
    );
  }
  return (
    <Image
      src={src}
      alt=""
      width={size}
      height={size}
      unoptimized
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn("shrink-0 object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}
