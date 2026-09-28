"use client";

import { RotateCcwIcon, TriangleAlertIcon } from "lucide-react";
import { useId, useRef } from "react";

import { VariablePicker } from "@/components/builder/variable-picker";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { unknownVariables, type TemplateVariable } from "@/lib/calendar/templates";

export function TemplateEditor({
  label,
  help,
  value,
  defaultValue,
  onChange,
  preview,
  multiline = false,
  maxLength,
  placeholder,
  variables,
  testId,
}: {
  label: string;
  help: string;
  value: string;
  defaultValue: string;
  onChange: (value: string) => void;
  /** Rendered example for the first previewed game. */
  preview?: string;
  multiline?: boolean;
  maxLength: number;
  placeholder?: string;
  variables?: TemplateVariable[];
  testId?: string;
}) {
  const id = useId();
  const helpId = `${id}-help`;
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const unknown = unknownVariables(value);

  function insert(token: string) {
    const el = ref.current;
    if (!el) {
      onChange(value + token);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const before = value.slice(0, start);
    const needsSpace = before.length > 0 && !/\s$/.test(before) && !multiline;
    const insertion = (needsSpace ? " " : "") + token;
    const next = (before + insertion + value.slice(end)).slice(0, maxLength);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const caret = Math.min(start + insertion.length, next.length);
      el.setSelectionRange(caret, caret);
    });
  }

  const common = {
    id,
    ref,
    value,
    maxLength,
    placeholder,
    "aria-describedby": helpId,
    "data-testid": testId,
    spellCheck: false,
    className: "bg-card font-mono text-[13px] dark:bg-card",
  };

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </label>
        {value !== defaultValue && (
          <button
            type="button"
            onClick={() => onChange(defaultValue)}
            className="inline-flex items-center gap-1 rounded text-xs text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <RotateCcwIcon className="size-3" aria-hidden="true" />
            Reset
          </button>
        )}
      </div>
      {multiline ? (
        <Textarea {...common} rows={3} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input {...common} onChange={(e) => onChange(e.target.value)} />
      )}
      <p id={helpId} className="text-xs text-muted-foreground">
        {help}
      </p>
      <VariablePicker onInsert={insert} variables={variables} label={label} />
      {unknown.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-warning" role="status">
          <TriangleAlertIcon className="size-3.5" aria-hidden="true" />
          Unknown variable{unknown.length > 1 ? "s" : ""}: {unknown.map((u) => `{${u}}`).join(", ")} — rendered as blank.
        </p>
      )}
      {preview !== undefined && (
        <div className="rounded-md border border-dashed border-border px-2.5 py-1.5 text-xs">
          <span className="text-muted-foreground">Example: </span>
          {preview ? (
            <span className="whitespace-pre-wrap text-foreground">{preview}</span>
          ) : (
            <span className="text-muted-foreground italic">blank</span>
          )}
        </div>
      )}
    </div>
  );
}
