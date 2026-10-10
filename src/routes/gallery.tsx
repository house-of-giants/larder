import { createFileRoute, notFound } from "@tanstack/react-router";
import GalleryPage from "#/components/gallery/gallery-page";

// The design gallery. Built in only where VITE_GALLERY is 1 (Vercel Preview and
// Development, CI, local). The flag is a build-time constant: with it off, `enabled` folds
// to false, the page is never referenced, and the bundler drops the module and its copy
// from both the client and the server output; the route answers "not found".
const enabled = import.meta.env.VITE_GALLERY === "1";

export const Route = createFileRoute("/gallery")({
  beforeLoad: () => {
    if (!enabled) throw notFound();
  },
  head: () => ({ meta: [{ title: "Gallery" }] }),
  component: enabled ? GalleryPage : () => null,
});
