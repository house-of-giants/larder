import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { AisleHeading } from "#/components/kit/aisle-heading";
import { Chip } from "#/components/kit/chip";
import { Fab } from "#/components/kit/fab";
import { ListRow } from "#/components/kit/list-row";
import { Pill } from "#/components/kit/pill";
import { categoryLabels } from "#/components/pantry/labels";
import { AddSomething } from "./add-something";
import { nextStatus, viewList } from "./list-view";
import { recipeNamesLine } from "./row-text";
import type { CurrentList, ListItem, TapStatus } from "./types";

// The sticky stack under the app header (3rem and its hairline): the progress line (h-6)
// and the chip row (h-16) pin together, and each aisle heading pins under them.
const PINNED_TOP = "top-[calc(3rem+1px+env(safe-area-inset-top))]";
const HEADING_TOP = "top-[calc(3rem+1px+5.5rem+env(safe-area-inset-top))]";

function sectionLabel(category: string): string {
  return categoryLabels[category] ?? category.replace(/_/g, " ");
}

/** "2026-10-12" -> "Oct 12", read as a calendar date, not a UTC instant. */
function weekOfLabel(weekOf: string): string {
  const [y, m, d] = weekOf.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** What to buy, in the list's own words: the purchase amount, or what the recipes need. */
function amountOf(item: ListItem) {
  return item.purchase ?? item.required;
}

/**
 * The list in the aisle: rows by store section under serif headings, a section filter,
 * checked rows kept in their aisle (filled, quiet, at the end of it), and things already
 * here or skipped folded away at the end. Add something is the floating button.
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
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const fab = useRef<HTMLButtonElement>(null);
  const view = viewList(list, filter);
  const activeFilter = filter !== null && view.categories.includes(filter) ? filter : null;

  const fold = (category: string) => () =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(category)) next.add(category);
      return next;
    });
  const row = (item: ListItem) => (
    <StoreRow
      key={item._id}
      item={item}
      onToggle={() => onSetStatus(item._id, nextStatus(item.status))}
    />
  );

  return (
    <Shell
      progress={
        <>
          <span>
            <span className="tabular">{view.toGet}</span> to get
          </span>
          {` · Week of ${weekOfLabel(list.weekOf)}`}
          <SyncPill online={online} pending={pending} />
        </>
      }
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
      {view.toGet === 0 && <p className="pt-4 text-muted-foreground">Nothing left to get.</p>}

      {view.sections.map((section) => {
        const headingId = `list-${section.category}`;
        const rowsId = `${headingId}-rows`;
        const folded = collapsed.has(section.category);
        return (
          <section key={section.category} aria-labelledby={headingId} className="flex flex-col">
            <AisleHeading
              id={headingId}
              title={sectionLabel(section.category)}
              count={section.needed.length}
              collapsed={folded}
              onToggle={fold(section.category)}
              controls={rowsId}
              sticky
              className={HEADING_TOP}
            />
            <ul id={rowsId} hidden={folded} className="flex flex-col">
              {section.needed.map(row)}
              {section.inCart.map(row)}
            </ul>
          </section>
        );
      })}

      <Group label="Already have" items={view.alreadyHave} row={row} />
      <Group label="Skipped" items={view.skipped} row={row} />

      <Fab ref={fab} label="Add something" onClick={() => setAdding(true)} />
      <AddSomething open={adding} onOpenChange={setAdding} opener={fab} canSend={canSend} />
    </Shell>
  );
}

/** One store row: the purchase amount, then the recipes it is for or "in the cart". */
function StoreRow({ item, onToggle }: { item: ListItem; onToggle: () => void }) {
  const checked = item.status === "checked";
  return (
    <ListRow
      data-testid="list-row"
      data-item-id={item._id}
      data-status={item.status}
      checked={checked}
      putBack={item.status === "onHand" || item.status === "skipped"}
      name={item.displayName}
      amount={amountOf(item)}
      // A snapshot saved before names were on the list has none; the row reads as before.
      note={checked ? "in the cart" : recipeNamesLine(item.sourceRecipeNames ?? [], item.source)}
      onToggle={onToggle}
    />
  );
}

/** No server answer, nothing saved: say so rather than spin. */
export function NoSignal({ pending }: { pending: number }) {
  return (
    <Shell progress={<SyncPill online={false} pending={pending} />}>
      <p className="pt-4 text-muted-foreground">
        No signal, and no list saved on this phone yet. Open the list once with a signal and it will
        be here next time.
      </p>
    </Shell>
  );
}

export function NoList({ online, pending }: { online: boolean; pending: number }) {
  return (
    <Shell progress={<SyncPill online={online} pending={pending} />}>
      <div className="flex flex-col items-start gap-1 pt-4">
        <p className="text-muted-foreground">No list yet. Make one from this week.</p>
        <Pill variant="text" asChild className="-ml-5">
          <Link to="/week">This week</Link>
        </Pill>
      </div>
    </Shell>
  );
}

/**
 * The title, then the progress line and the chip row pinned together under the app
 * header, so "33 to get" never scrolls away.
 */
function Shell({
  progress,
  filterBar,
  children,
}: {
  progress: ReactNode;
  filterBar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex max-w-2xl flex-col px-5 pt-3 pb-24">
      <h1 className="font-display text-display">Store</h1>
      <div className={`sticky z-10 -mx-5 bg-background px-5 ${PINNED_TOP}`}>
        <p className="h-6 truncate text-caption leading-6 text-muted-foreground">{progress}</p>
        {filterBar}
      </div>
      {children}
    </main>
  );
}

/** Says when taps are waiting for a signal, in tomato after the progress line. */
function SyncPill({ online, pending }: { online: boolean; pending: number }) {
  const queued = pending > 0 && (
    <>
      <span className="tabular">{pending}</span> queued
    </>
  );
  return (
    <output className="contents">
      {(!online || queued) && (
        <span data-testid="sync-pill" className="ml-2 text-primary">
          {online ? queued : queued ? <>offline, {queued}</> : "offline"}
        </span>
      )}
    </output>
  );
}

/** The section filter: chips that scroll sideways, fading at the right edge. */
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
    <nav aria-label="Store sections" className="-mx-5">
      <ul className="flex h-16 items-center gap-2.5 overflow-x-auto px-5 mask-r-from-[calc(100%-2.5rem)] [scrollbar-width:none]">
        {chips.map(({ value, label }) => (
          <li key={value ?? "all"} className="shrink-0">
            <Chip
              selected={value === active}
              onClick={(event) => {
                onChange(value);
                event.currentTarget.scrollIntoView({ inline: "nearest", block: "nearest" });
              }}
            >
              {label}
            </Chip>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Rows out of the way at the end of the list, one tap from coming back. */
function Group({
  label,
  items,
  row,
}: {
  label: string;
  items: ListItem[];
  row: (item: ListItem) => ReactNode;
}) {
  if (items.length === 0) return null;
  return (
    <details className="group mt-4">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-sm text-subhead text-muted-foreground focus-ring [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden
          className="size-4 transition-transform duration-[120ms] group-open:rotate-90"
        />
        <span>
          {label} (<span className="tabular">{items.length}</span>)
        </span>
      </summary>
      <ul className="flex flex-col">{items.map(row)}</ul>
    </details>
  );
}
