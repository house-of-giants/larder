import { createFileRoute } from "@tanstack/react-router";
import { useConvexAuth, useQuery } from "convex/react";
import { PageSkeleton } from "#/components/page-skeleton";
import { currentList } from "#/components/list/list-data";
import { NoList, NoSignal, StoreView } from "#/components/list/store-view";
import { useHousehold } from "#/hooks/use-household";
import { applyOps } from "#/offline/overlay";
import { useListSnapshot } from "#/offline/snapshot";
import { useListOps } from "#/offline/use-list-ops";

export const Route = createFileRoute("/_app/list/")({
  component: Store,
});

/** Store mode: the server's list when it has answered, else the copy saved on this phone. */
function Store() {
  const { isAuthenticated } = useConvexAuth();
  const household = useHousehold();
  const live = useQuery(currentList, isAuthenticated ? {} : "skip");
  const saved = useListSnapshot(live, household?.household._id ?? null);
  const ops = useListOps();

  const base = live !== undefined ? live : saved?.list;

  if (base === undefined) {
    return saved === null && !ops.online ? <NoSignal pending={ops.pending} /> : <PageSkeleton />;
  }
  if (base === null) {
    return <NoList online={ops.online} pending={ops.pending} />;
  }
  return (
    <StoreView
      list={applyOps(base, ops.queued)}
      online={ops.online}
      pending={ops.pending}
      canSend={ops.canSend}
      onSetStatus={(listItemId, status) => void ops.setStatus(listItemId, status)}
    />
  );
}
