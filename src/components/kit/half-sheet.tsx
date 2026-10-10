import { XIcon } from "lucide-react";
import { type ReactNode, type RefObject, useState } from "react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "#/components/ui/sheet";
import { cn } from "#/lib/utils";

/**
 * The half sheet (DESIGN.md): rises from the bottom over the scrim, Paper Sheet fill, 18px
 * top corners, a serif title with a quiet note under it, and a footer in thumb reach for
 * the one full-width primary pill (`<Pill sheet>`). The X or the scrim cancels.
 *
 * The sheet is controlled, so Radix has no trigger to hand focus back to. Pass `opener`,
 * a ref to whatever opened it (a Pill, the Fab, a row), and closing returns focus there.
 * With more than one opener, set the ref in each one's click handler:
 * `onClick={(e) => { opener.current = e.currentTarget; setOpen(true); }}`. When the opener
 * is gone by then (what opened the sheet was the thing it changed), focus goes to
 * `fallbackFocus`, a stable element such as the screen's title with `tabIndex={-1}`.
 *
 * The body scrolls between the title block and the footer; once it is scrolled, a hairline
 * under the title block shows where the rows go under it.
 */
export function HalfSheet({
  open,
  onOpenChange,
  opener,
  fallbackFocus,
  title,
  note,
  footer,
  className,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opener?: RefObject<HTMLElement | null>;
  fallbackFocus?: RefObject<HTMLElement | null>;
  title: string;
  note?: ReactNode;
  footer?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  const [scrolled, setScrolled] = useState(false);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        onCloseAutoFocus={(event) => {
          const target = opener?.current?.isConnected ? opener.current : fallbackFocus?.current;
          if (!target?.isConnected) return;
          event.preventDefault();
          target.focus();
        }}
        // With no note there is nothing to describe the sheet; say so rather than repeat the title.
        {...(note ? {} : { "aria-describedby": undefined })}
        className={cn(
          "mx-auto max-h-[92dvh] max-w-2xl gap-0 rounded-t-[18px] border-0 bg-popover px-5 pt-4 text-popover-foreground shadow-none ease-[cubic-bezier(0.2,0,0,1)] data-[state=closed]:duration-200 data-[state=open]:duration-[240ms]",
          className,
        )}
      >
        <SheetTitle className="pr-10 font-display text-[1.5rem] leading-[1.15] font-normal">
          {title}
        </SheetTitle>
        {note && (
          <SheetDescription className="mt-1 text-caption text-muted-foreground">
            {note}
          </SheetDescription>
        )}
        <div
          data-slot="half-sheet-body"
          data-scrolled={scrolled}
          onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}
          className="-mx-5 mt-3 min-h-0 flex-1 overflow-y-auto border-t border-transparent px-5 data-[scrolled=true]:border-border"
        >
          {children}
        </div>
        {footer && (
          <div
            data-slot="half-sheet-footer"
            className="pt-3 pb-[calc(1.125rem+env(safe-area-inset-bottom))]"
          >
            {footer}
          </div>
        )}
        <SheetClose className="absolute top-2.5 right-2.5 flex size-11 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-ring">
          <XIcon aria-hidden className="size-[22px]" />
          <span className="sr-only">Close</span>
        </SheetClose>
      </SheetContent>
    </Sheet>
  );
}
