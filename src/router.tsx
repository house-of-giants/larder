import { createRouter } from "@tanstack/react-router";
import { ErrorScreen, NotFound } from "#/components/route-states";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    // A screen that throws (a failed Convex query included) shows a line and Try again in
    // place of itself, inside the app shell; an unknown path under a layout does the same.
    defaultErrorComponent: ErrorScreen,
    defaultNotFoundComponent: NotFound,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
