// Every kit primitive in the copy of a real week, once in the page's theme and once in
// dark. Lives outside src/routes so a build without VITE_GALLERY drops it entirely.
import { BookOpen, CalendarDays, CookingPot, Refrigerator, ShoppingBasket } from "lucide-react";
import { useRef, useState, type MouseEvent, type ReactNode } from "react";
import { AisleHeading } from "#/components/kit/aisle-heading";
import { Amount } from "#/components/kit/amount";
import { Chip } from "#/components/kit/chip";
import { Fab } from "#/components/kit/fab";
import { HalfSheet } from "#/components/kit/half-sheet";
import { ListRow } from "#/components/kit/list-row";
import { Pill } from "#/components/kit/pill";
import { TabBar, type Tab } from "#/components/tab-bar";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { cn } from "#/lib/utils";

const LONGEST_NAME = "Sheet Pan Maple Mustard Sausage, Sweet Potato and Brussels Sprouts";

const tabs: readonly Tab[] = [
  { to: "/week", label: "Week", icon: CalendarDays },
  { to: "/list", label: "List", icon: ShoppingBasket },
  { to: "/pantry", label: "Pantry", icon: Refrigerator },
  { to: "/recipes", label: "Recipes", icon: BookOpen },
];

type Row = {
  name: string;
  quantityText: string;
  unit: string;
  for: string | null;
  status: "needed" | "checked" | "onHand";
};

const produce: Row[] = [
  { name: "carrots", quantityText: "1", unit: "lb", for: "Pot roast", status: "needed" },
  { name: "celery stalks", quantityText: "3", unit: "each", for: "Pot roast", status: "needed" },
  {
    name: "cremini mushrooms",
    quantityText: "16",
    unit: "oz",
    for: "Salisbury meatballs",
    status: "needed",
  },
  { name: "kosher salt", quantityText: "as needed", unit: "", for: "Pot roast", status: "needed" },
  {
    name: "flat leaf parsley",
    quantityText: "2",
    unit: "tbsp",
    for: "Salisbury meatballs",
    status: "onHand",
  },
  {
    name: "baby Yukon Gold potatoes",
    quantityText: "1 1/2",
    unit: "lb",
    for: "Pot roast",
    status: "checked",
  },
  {
    name: "Brussels sprouts",
    quantityText: "1 1/2",
    unit: "lb",
    for: "Sheet pan sausage",
    status: "checked",
  },
];

const sheetRows = [
  { name: "bacon", quantityText: "8", unit: "oz" },
  { name: "large eggs", quantityText: "6", unit: "each" },
  { name: "unsalted butter", quantityText: "9", unit: "tbsp" },
  { name: "buttermilk", quantityText: "1", unit: "cup" },
];

const aisles = [
  "All",
  "Produce",
  "Meat and deli",
  "Dairy and refrigerated",
  "Bread, cans, and jars",
];

/** The gallery page. Imported only by src/routes/gallery.tsx, and only when VITE_GALLERY is 1. */
export default function Gallery() {
  return (
    <main className="mx-auto max-w-6xl py-6 lg:px-5">
      <div className="px-5">
        <h1 className="font-display text-display">Gallery</h1>
        <p className="mt-1 text-caption text-muted-foreground">
          The kit from DESIGN.md, once in this theme and once in dark.
        </p>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Specimens title="This theme" />
        <Specimens title="Dark" dark />
      </div>
    </main>
  );
}

function Specimens({ title, dark = false }: { title: string; dark?: boolean }) {
  const [rows, setRows] = useState(produce);
  const [aisle, setAisle] = useState("All");
  const [sheetOpen, setSheetOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const openSheet = (event: MouseEvent<HTMLElement>) => {
    opener.current = event.currentTarget;
    setSheetOpen(true);
  };

  const toggle = (name: string) =>
    setRows((current) =>
      current.map((r) =>
        r.name === name ? { ...r, status: r.status === "checked" ? "needed" : "checked" } : r,
      ),
    );
  const toGet = rows.filter((r) => r.status === "needed").length;

  return (
    <section
      aria-label={title}
      className={cn(
        "flex min-w-0 flex-col gap-10 bg-background px-5 py-6 text-foreground lg:rounded-xl",
        dark && "dark",
      )}
    >
      <h2 className="font-display text-title">{title}</h2>

      <Specimen title="Type">
        <dl className="flex flex-col gap-5">
          <Role name="Display" spec="32/1.1" face="Young Serif">
            <span className="font-display text-display">{LONGEST_NAME}</span>
          </Role>
          <Role name="Title" spec="22/1.2" face="Young Serif">
            <span className="font-display text-title">{LONGEST_NAME}</span>
          </Role>
          <Role name="Body" spec="17/1.3">
            <span className="text-body">cremini mushrooms</span>
          </Role>
          <Role name="Secondary" spec="15/1.35">
            <span className="text-subhead">Plan the week</span>
          </Role>
          <Role name="Caption" spec="13/1.35">
            <span className="text-caption text-muted-foreground">
              <span className="tabular">33</span> to get · Week of Oct{" "}
              <span className="tabular">9</span>
            </span>
          </Role>
          <Role name="Label" spec="11/1.2, 0.02em">
            <span className="text-label text-muted-foreground">portions</span>
          </Role>
        </dl>
      </Specimen>

      <Specimen title="Store list">
        <div>
          <AisleHeading title="Produce" count={toGet} />
          <ul>
            {rows.map((r) => (
              <ListRow
                key={r.name}
                name={r.name}
                amount={r}
                for={r.for}
                checked={r.status === "checked"}
                putBack={r.status === "onHand"}
                onToggle={() => toggle(r.name)}
              />
            ))}
          </ul>
          <AisleHeading title="Dairy and refrigerated" count={6} collapsed />
        </div>
      </Specimen>

      <Specimen title="Tonight">
        <article className="rounded-lg border border-border bg-card px-4 py-3.5 text-card-foreground">
          <h4 className="font-display text-title">{LONGEST_NAME}</h4>
          <p className="mt-1.5 text-caption text-muted-foreground">
            Tonight · <Amount quantityText="6" unit="portions" /> · elk sausage swapped in
          </p>
          <div className="mt-3 flex items-center gap-3">
            <Pill variant="pale">
              <CookingPot aria-hidden className="size-[18px]" />
              Made it
            </Pill>
            <button
              type="button"
              aria-label="Open the recipe"
              className="flex size-11 items-center justify-center rounded-full border border-border text-muted-foreground outline-none hover:text-foreground focus-ring"
            >
              <BookOpen aria-hidden className="size-5" />
            </button>
          </div>
        </article>
      </Specimen>

      <Specimen title="Pills">
        <div className="flex flex-wrap items-center gap-3">
          <Pill>Make the list</Pill>
          <Pill variant="pale">
            <CookingPot aria-hidden className="size-[18px]" />
            Made it
          </Pill>
          <Pill variant="outline">Made it</Pill>
          <Pill variant="text">Plan the week</Pill>
          <Pill disabled>Make the list</Pill>
        </div>
      </Specimen>

      <Specimen title="Chips">
        <div className="-mr-5 flex gap-2 overflow-x-auto pr-5 [mask-image:linear-gradient(90deg,#000_88%,transparent)]">
          {aisles.map((name) => (
            <Chip key={name} selected={aisle === name} onClick={() => setAisle(name)}>
              {name}
            </Chip>
          ))}
        </div>
      </Specimen>

      <Specimen title="Field">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`gallery-field-${dark ? "dark" : "page"}`} className="text-subhead">
            Add something
          </Label>
          <Input
            id={`gallery-field-${dark ? "dark" : "page"}`}
            placeholder="What to buy"
            autoComplete="off"
          />
        </div>
      </Specimen>

      <Specimen title="Tab bar and add button">
        <div className="relative -mx-5 h-40 overflow-hidden">
          <Fab label="Add something" className="absolute bottom-20" onClick={openSheet} />
          <TabBar tabs={tabs} current="/list" className="absolute" />
        </div>
      </Specimen>

      <Specimen title="Half sheet">
        <div>
          <Pill variant="outline" onClick={openSheet}>
            Open the sheet
          </Pill>
          <HalfSheet
            open={sheetOpen}
            onOpenChange={setSheetOpen}
            opener={opener}
            title="Bacon, Egg and Pepper Jack Breakfast Biscuits"
            note={
              <>
                <span className="tabular">1</span> batch makes{" "}
                <Amount quantityText="8" unit="biscuits" />.
              </>
            }
            className={cn(dark && "dark")}
            footer={
              <Pill sheet onClick={() => setSheetOpen(false)}>
                Made it
              </Pill>
            }
          >
            <ul>
              {sheetRows.map((r) => (
                <li
                  key={r.name}
                  className="flex min-h-11 items-center gap-1.5 border-b border-border text-body last:border-b-0"
                >
                  <Amount quantityText={r.quantityText} unit={r.unit} />
                  <span>{r.name}</span>
                </li>
              ))}
            </ul>
          </HalfSheet>
        </div>
      </Specimen>
    </section>
  );
}

function Specimen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-subhead font-semibold">{title}</h3>
      {children}
    </div>
  );
}

/** One type role: the sample, then its name and measures under it. */
function Role({
  name,
  spec,
  face,
  children,
}: {
  name: string;
  spec: string;
  face?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col-reverse gap-1">
      <dt className="text-caption text-muted-foreground">
        {name} · <span className="tabular">{spec}</span>
        {face && `, ${face}`}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}
