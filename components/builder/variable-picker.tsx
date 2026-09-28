"use client";

import { useState } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TEMPLATE_VARIABLES, type TemplateVariable } from "@/lib/calendar/templates";

export function VariablePicker({
  onInsert,
  variables = TEMPLATE_VARIABLES,
  label,
}: {
  onInsert: (token: string) => void;
  variables?: TemplateVariable[];
  label: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const common = variables.filter((v) => v.common);
  const visible = expanded || common.length === 0 ? variables : common;

  return (
    <div role="group" aria-label={`Insert a variable into ${label}`} className="flex flex-wrap gap-1">
      {visible.map((v) => (
        <Tooltip key={v.name}>
          <TooltipTrigger asChild>
            <button
              type="button"
              // Keep focus (and the caret position) in the field while clicking.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onInsert(`{${v.name}}`)}
              aria-label={`Insert {${v.name}}: ${v.description}`}
              className="inline-flex h-6 items-center rounded-md border border-border bg-secondary px-1.5 font-mono text-[11px] text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {`{${v.name}}`}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">{v.description}</TooltipContent>
        </Tooltip>
      ))}
      {common.length > 0 && common.length < variables.length && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className="inline-flex h-6 items-center rounded-md px-1.5 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {expanded ? "Fewer" : `All variables (${variables.length})`}
        </button>
      )}
    </div>
  );
}
