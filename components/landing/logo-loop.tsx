"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

import { LeagueLogo } from "@/components/builder/league-logo";
import { LEAGUE_LIST } from "@/lib/config/leagues";

/** Seamless, content-width loop for the supported league marks. */
export function LogoLoop() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sequenceRef = useRef<HTMLUListElement>(null);
  const [dimensions, setDimensions] = useState({ sequenceWidth: 0, copyCount: 2 });

  const updateDimensions = useCallback(() => {
    const containerWidth = containerRef.current?.clientWidth ?? 0;
    const sequenceWidth = sequenceRef.current?.getBoundingClientRect().width ?? 0;
    if (!containerWidth || !sequenceWidth) return;

    setDimensions({
      sequenceWidth: Math.ceil(sequenceWidth),
      copyCount: Math.max(2, Math.ceil(containerWidth / sequenceWidth) + 2),
    });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const sequence = sequenceRef.current;
    if (!container || !sequence) return;

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateDimensions);
      updateDimensions();
      return () => window.removeEventListener("resize", updateDimensions);
    }

    const observer = new ResizeObserver(updateDimensions);
    observer.observe(container);
    observer.observe(sequence);
    updateDimensions();
    return () => observer.disconnect();
  }, [updateDimensions]);

  const sequence = (copy: number) => (
    <ul
      key={copy}
      ref={copy === 0 ? sequenceRef : undefined}
      className="logo-loop__list flex shrink-0 items-center gap-14 pr-14"
      aria-hidden={copy > 0 || undefined}
    >
      {LEAGUE_LIST.map((league) => (
        <li key={league.key} className="flex items-center" title={league.label}>
          <LeagueLogo league={league.key} label={league.label} size={40} />
        </li>
      ))}
    </ul>
  );

  return (
    <div
      ref={containerRef}
      className="logo-loop overflow-hidden"
      role="region"
      aria-label="Supported leagues"
    >
      <div
        className="logo-loop__track flex w-max items-center"
        style={{
          "--logo-loop-distance": `${dimensions.sequenceWidth}px`,
          animationDuration: dimensions.sequenceWidth ? `${dimensions.sequenceWidth / 48}s` : undefined,
        } as CSSProperties}
      >
        {Array.from({ length: dimensions.copyCount }, (_, copy) => sequence(copy))}
      </div>
    </div>
  );
}
