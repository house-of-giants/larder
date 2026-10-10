import { ClerkProvider, useAuth } from "@clerk/tanstack-react-start";
import {
  HeadContent,
  Scripts,
  createRootRoute,
  rootRouteId,
  useMatch,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useEffect, type ReactNode } from "react";
import { ErrorScreen, NotFound } from "#/components/route-states";
import { Toaster } from "#/components/ui/sonner";
import { clerkConfigured } from "#/lib/clerk-config";
import { convex } from "#/lib/convex";
import { useThemeSync } from "#/hooks/use-theme";
import { themeScript } from "#/lib/theme";
import { OfflineIdentityProvider } from "#/offline/identity";
import { registerServiceWorker } from "#/offline/register-sw";
import appCss from "#/styles.css?url";

// Read on the server at request time so a missing Clerk key is reported, not crashed on.
const getShellConfig = createServerFn({ method: "GET" }).handler(() => ({
  clerkConfigured: clerkConfigured(),
}));

export const Route = createRootRoute({
  // Signed-in pages carry the member's session; no shared cache may keep them.
  headers: () => ({ "Cache-Control": "private, no-store" }),
  loader: () => getShellConfig(),
  staleTime: Infinity,
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      // Installed from the home screen, the app opens without browser chrome.
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Larder" },
      // A solid bar with dark text above the app; content stays below it.
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { title: "Larder" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
    // Applies the saved theme before the first paint, so dark mode never flashes light. It
    // also writes the theme-color meta, which is deliberately not in the list above.
    scripts: [{ children: themeScript }],
  }),
  shellComponent: RootDocument,
  // The shell wraps these too, so they render inside Clerk and Convex.
  errorComponent: ErrorScreen,
  notFoundComponent: NotFound,
});

/**
 * The document, and the providers every screen needs. The shell wraps the root's
 * component, error component, and not-found component alike, so all three get them.
 */
function RootDocument({ children }: { children: ReactNode }) {
  // Effects run only in the browser, so the server render never touches the worker.
  useEffect(registerServiceWorker, []);
  // On System, follows the phone as it flips; picks up a choice made in another tab.
  useThemeSync();
  // Undefined only when the root loader itself failed; the error screen needs no providers.
  const configured = useMatch({
    from: rootRouteId,
    select: (match) => match.loaderData?.clerkConfigured,
  });

  return (
    // The head script sets `dark` on <html> before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {configured === false ? (
          <SetupNeeded />
        ) : configured ? (
          <Providers>{children}</Providers>
        ) : (
          children
        )}
        <Scripts />
      </body>
    </html>
  );
}

function Providers({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider appearance={clerkAppearance} allowedRedirectOrigins={allowedRedirectOrigins()}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <OfflineIdentityProvider>{children}</OfflineIdentityProvider>
        <Toaster position="top-center" />
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}

// Clerk follows a redirect only to these origins. Its default also allows every subdomain
// of the Frontend API's parent domain (a sibling app, or anyone's on a shared one); the app
// sends people back only to itself. Clerk checks redirects in the browser, so the server
// render passes nothing.
function allowedRedirectOrigins(): string[] | undefined {
  return typeof window === "undefined" ? undefined : [window.location.origin];
}

// Clerk's sign-in and sign-up cards drawn from the app's own tokens, so they follow the
// theme with it (no @clerk/themes needed).
const clerkAppearance = {
  variables: {
    colorPrimary: "var(--primary)",
    colorPrimaryForeground: "var(--primary-foreground)",
    colorBackground: "var(--card)",
    colorForeground: "var(--card-foreground)",
    colorMuted: "var(--muted)",
    colorMutedForeground: "var(--muted-foreground)",
    colorNeutral: "var(--foreground)",
    colorInput: "var(--background)",
    colorInputForeground: "var(--foreground)",
    colorBorder: "var(--border)",
    colorRing: "var(--ring)",
    colorDanger: "var(--destructive)",
    fontFamily: "var(--font-sans)",
    borderRadius: "var(--radius)",
  },
};

function SetupNeeded() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Larder</h1>
      <p className="text-muted-foreground">
        Sign-in is not configured yet. Set{" "}
        <code className="font-mono">VITE_CLERK_PUBLISHABLE_KEY</code> and{" "}
        <code className="font-mono">CLERK_SECRET_KEY</code>, then restart the server.
      </p>
    </main>
  );
}
