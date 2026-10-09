import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { categoryLabels } from "#/components/pantry/labels";
import { cn } from "#/lib/utils";
import { AddSomething } from "./add-something";
import { ListRow } from "./list-row";
import { nextStatus, viewList } from "./list-view";
import type { CurrentList, ListItem, TapStatus } from "./types";

// The app header is 3rem; the filter bar sticks under it and section headers under that.
const FILTER_TOP = "top-[calc(3rem+env(safe-area-inset-top))]";
const SECTION_TOP = "top-[calc(6.5rem+env(safe-area-inset-top))]";

function sectionLabel(category: string): string {
  return categoryLabels[category] ?? category.replace(/_/g, " ");
}

/** "2026-10-12" -> "Oct 12", read as a calendar date, not a UTC instant. */
function weekOfLabel(weekOf: string): string {
  const [y, m, d] = weekOf.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * The list in the aisle: big rows by store section, a section filter, checked rows
 * folded into the cart under their section, and things already here at the end.
 */
export function StoreView({
  list,
  online,
  pending,
  canSend,
  onSetStatus,
}: {
  list: CurrentList;
  online: boolean;
  pending: number;
  canSend: boolean;
  onSetStatus: (listItemId: Id<"listItems">, status: TapStatus) => void;
}) {
  const [filter, setFilter] = useState<string | null>(null);
  const view = viewList(list, filter);
  const activeFilter = filter !== null && view.categories.includes(filter) ? filter : null;
  const toggle = (item: ListItem) => () => onSetStatus(item._id, nextStatus(item.status));
  const skip = (item: ListItem) => () => onSetStatus(item._id, "skipped");

  return (
    <Shell
      weekOf={list.weekOf}
      toGet={view.toGet}
      pill={<SyncPill online={online} pending={pending} />}
      filterBar={
        view.categories.length > 0 && (
          <FilterBar
            categories={view.categories}
            active={activeFilter}
            onChange={(next) => {
              setFilter(next);
              window.scrollTo({ top: 0 });
            }}
          />
        )
      }
    >
      {view.toGet === 0 && <p className="py-4 text-muted-foreground">Nothing left to get.</p>}

      {view.sections.map((section) => {
        const headingId = `list-${section.category}`;
        return (
          <section key={section.category} aria-labelledby={headingId} className="flex flex-col">
            <h2
              id={headingId}
              className={cn(
                "sticky z-[4] flex items-baseline justify-between bg-background py-2 text-sm font-medium text-muted-foreground",
                SECTION_TOP,
              )}
            >
              {sectionLabel(section.category)}
              <span className="num">{section.needed.length}</span>
            </h2>
            {section.needed.length > 0 && (
              <ul className="flex flex-col divide-y rounded-lg border bg-card">
                {section.needed.map((item) => (
                  <ListRow key={item._id} item={item} onToggle={toggle(item)} onSkip={skip(item)} />
                ))}
              </ul>
            )}
            <Group label="In the cart" items={section.inCart} toggle={toggle} />
          </section>
        );
      })}

      <Group label="Already have" items={view.alreadyHave} toggle={toggle} />
      <Group label="Skipped" items={view.skipped} toggle={toggle} />

      <AddSomething canSend={canSend} />
    </Shell>
  );
}

/** No server answer, nothing saved: say so rather than spin. */
export function NoSignal({ pending }: { pending: number }) {
  return (
    <Shell pill={<SyncPill online={false} pending={pending} />}>
      <p className="text-muted-foreground">
        No signal, and no list saved on this phone yet. Open the list once with a signal and it will
        be here next time.
      </p>
    </Shell>
  );
}

export function NoList({ online, pending }: { online: boolean; pending: number }) {
  return (
    <Shell pill={<SyncPill online={online} pending={pending} />}>
      <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed px-4 py-8">
        <p className="text-muted-foreground">No list yet. Make one from this week.</p>
        <Link to="/week" className="font-medium text-primary underline-offset-4 hover:underline">
          This week
        </Link>
      </div>
    </Shell>
  );
}

function Shell({
  weekOf,
  toGet,
  pill,
  filterBar,
  children,
}: {
  weekOf?: string;
  toGet?: number;
  pill: ReactNode;
  filterBar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pt-6 pb-8">
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Store</h1>
          {toGet !== undefined && (
            <p className="text-lg font-medium">
              <span className="num">{toGet}</span> to get
            </p>
          )}
        </div>
        <div className="flex min-h-7 items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {weekOf ? `Week of ${weekOfLabel(weekOf)}` : ""}
          </p>
          {pill}
        </div>
      </div>
      {filterBar}
      {children}
    </main>
  );
}

/** Says when taps are waiting for a signal. Absent when everything has gone through. */
function SyncPill({ online, pending }: { online: boolean; pending: number }) {
  const text = online
    ? pending > 0
      ? `${pending} queued`
      : null
    : pending > 0
      ? `offline, ${pending} queued`
      : "offline";
  return (
    <output className="contents">
      {text && (
        <span
          data-testid="sync-pill"
          className="rounded-full border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground tabular-nums"
        >
          {text}
        </span>
      )}
    </output>
  );
}

function FilterBar({
  categories,
  active,
  onChange,
}: {
  categories: string[];
  active: string | null;
  onChange: (category: string | null) => void;
}) {
  const chips: { value: string | null; label: string }[] = [
    { value: null, label: "All" },
    ...categories.map((category) => ({ value: category, label: sectionLabel(category) })),
  ];
  return (
    <nav
      aria-label="Store sections"
      className={cn("sticky z-[5] -mx-4 border-b bg-background/95 backdrop-blur", FILTER_TOP)}
    >
      <ul className="flex h-14 items-center gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
        {chips.map(({ value, label }) => {
          const current = value === active;
          return (
            <li key={value ?? "all"} className="shrink-0">
              <button
                type="button"
                aria-pressed={current}
                onClick={() => onChange(value)}
                className={cn(
                  "min-h-10 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors duration-100 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  current
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-card text-foreground",
                )}
              >
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** A collapsed run of rows that are out of the way but one tap from coming back. */
function Group({
  label,
  items,
  toggle,
}: {
  label: string;
  items: ListItem[];
  toggle: (item: ListItem) => () => void;
}) {
  if (items.length === 0) return null;
  return (
    <details className="group mt-1">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 text-sm text-muted-foreground [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden
          className="inline-block transition-transform duration-100 group-open:rotate-90"
        >
          ›
        </span>
        <span className="tabular-nums">{`${label} (${items.length})`}</span>
      </summary>
      <ul className="flex flex-col divide-y rounded-lg border bg-card">
        {items.map((item) => (
          <ListRow key={item._id} item={item} onToggle={toggle(item)} />
        ))}
      </ul>
    </details>
  );
}
