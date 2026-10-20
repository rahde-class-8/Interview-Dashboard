"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenCheck, Briefcase, PhoneCall, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { useAppStore } from "@/lib/store/app-store";
import { findById, getCallRows } from "@/lib/store/selectors";

interface SearchResult {
  id: string;
  href: string;
  label: string;
  detail: string;
  kind: "Call" | "Opportunity" | "Question";
}

const ICONS = { Call: PhoneCall, Opportunity: Briefcase, Question: BookOpenCheck };

/** Header search across calls, opportunities and the question bank. */
export function GlobalSearch() {
  const { data, status } = useAppStore();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const pathname = usePathname();

  // Close results whenever navigation happens.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
    setQuery("");
  }

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q || status !== "ready") return [];
    const match = (...fields: string[]) => fields.some((f) => f.toLowerCase().includes(q));

    const calls = getCallRows(data)
      .filter((r) => match(r.recruiterName, r.companyName, r.jobTitle))
      .map((r) => ({
        id: r.call.id,
        href: `/calls/${r.call.id}`,
        label: `${r.recruiterName} — ${r.jobTitle}`,
        detail: r.companyName,
        kind: "Call" as const,
      }));
    const opportunities = data.opportunities
      .map((o) => ({ o, company: findById(data.companies, o.companyId)?.name ?? "" }))
      .filter(({ o, company }) => match(o.title, company, o.location))
      .map(({ o, company }) => ({
        id: o.id,
        href: `/opportunities/${o.id}`,
        label: o.title,
        detail: company,
        kind: "Opportunity" as const,
      }));
    const questions = data.questions
      .filter((qn) => match(qn.question, qn.topic))
      .map((qn) => ({
        id: qn.id,
        href: `/questions?q=${encodeURIComponent(query.trim())}`,
        label: qn.question,
        detail: qn.topic,
        kind: "Question" as const,
      }));
    return [...opportunities, ...calls, ...questions].slice(0, 8);
  }, [data, query, status]);

  const showResults = open && query.trim().length > 0;

  return (
    <div
      ref={containerRef}
      className="relative w-full max-w-md"
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <label htmlFor="global-search" className="sr-only">
        Search calls, opportunities and questions
      </label>
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        id="global-search"
        type="search"
        placeholder="Search calls, companies, questions…"
        className="pl-9"
        value={query}
        autoComplete="off"
        aria-controls={showResults ? listId : undefined}
        aria-expanded={showResults}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
      />
      {showResults && (
        <div
          id={listId}
          className="absolute top-full right-0 left-0 z-40 mt-1 max-h-96 overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
        >
          {results.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">No matches found</p>
          ) : (
            <ul aria-label="Search results">
              {results.map((r) => {
                const Icon = ICONS[r.kind];
                return (
                  <li key={`${r.kind}-${r.id}`}>
                    <Link
                      href={r.href}
                      className="flex items-start gap-3 rounded-sm px-3 py-2 text-sm outline-none hover:bg-accent focus-visible:bg-accent"
                    >
                      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{r.label}</span>
                        <span className="block text-xs text-muted-foreground">
                          {r.kind} · {r.detail}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
