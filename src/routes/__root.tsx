import { ClerkProvider, useAuth } from "@clerk/tanstack-react-start";
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useEffect, type ReactNode } from "react";
import { clerkConfigured } from "#/lib/clerk-config";
import { convex } from "#/lib/convex";
import { Toaster } from "#/components/ui/sonner";
import { OfflineIdentityProvider } from "#/offline/identity";
import { registerServiceWorker } from "#/offline/register-sw";
import appCss from "#/styles.css?url";

// Read on the server at request time so a missing Clerk key is reported, not crashed on.
const getShellConfig = createServerFn({ method: "GET" }).handler(() => ({
  clerkConfigured: clerkConfigured(),
}));

export const Route = createRootRoute({
  loader: () => getShellConfig(),
  staleTime: Infinity,
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#f6f3ec" },
      // Installed from the home screen, the app opens without browser chrome.
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Larder" },
      { title: "Larder" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
  shellComponent: RootDocument,
  component: RootLayout,
});

function RootDocument({ children }: { children: ReactNode }) {
  // Effects run only in the browser, so the server render never touches the worker.
  useEffect(registerServiceWorker, []);

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootLayout() {
  const { clerkConfigured } = Route.useLoaderData();

  if (!clerkConfigured) {
    return <SetupNeeded />;
  }

  return (
    <ClerkProvider>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <OfflineIdentityProvider>
          <Outlet />
        </OfflineIdentityProvider>
        <Toaster position="top-center" />
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}

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
