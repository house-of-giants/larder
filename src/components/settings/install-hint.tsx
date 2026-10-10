import { useSyncExternalStore } from "react";
import { isStandalone } from "#/lib/standalone";

const STANDALONE_QUERY = "(display-mode: standalone)";

function subscribe(onChange: () => void) {
  const media = matchMedia(STANDALONE_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function readStandalone() {
  // `standalone` is Safari's own, so the DOM types do not know it.
  const { standalone } = navigator as { standalone?: boolean };
  return isStandalone({ matchMedia: (query) => matchMedia(query), navigator: { standalone } });
}

/**
 * How to put Larder on the home screen, where it opens without browser chrome and store
 * mode works with no signal. Hidden once it is running from there (and in the server
 * render, which cannot know).
 */
export function InstallHint() {
  const standalone = useSyncExternalStore(subscribe, readStandalone, () => true);
  if (standalone) return null;
  return (
    <section className="flex flex-col gap-2" aria-labelledby="install-heading">
      <h2 id="install-heading" className="font-medium">
        Add to home screen
      </h2>
      <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
        <li>
          <span className="text-foreground">iPhone:</span> Share, then Add to Home Screen.
        </li>
        <li>
          <span className="text-foreground">Android:</span> the browser menu, then Install app.
        </li>
      </ul>
    </section>
  );
}
