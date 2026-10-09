import type { FileRouteTypes } from "#/routeTree.gen";

// Store mode (/list) is built in a parallel lane. Until both land on one branch the typed
// router does not know the route, so the path is widened here, once. After the merge this
// can become a plain "/list" at each use.
export const listPath = "/list" as string as FileRouteTypes["to"];
