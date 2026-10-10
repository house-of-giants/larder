import { createFileRoute } from "@tanstack/react-router";
import { useConvexAuth, useQuery } from "convex/react";
import { StoreSkeleton } from "#/components/page-skeleton";
import { currentList } from "#/components/list/list-data";
import { NoList, NoSignal, StoreView } from "#/components/list/store-view";
import { useOfflineIdentity } from "#/offline/identity";
import { applyOps } from "#/offline/overlay";
import { useListSnapshot } from "#/offline/snapshot";
import { useListOps } from "#/offline/use-list-ops";

export const Route = createFileRoute("/_app/list/")({
  component: Store,
});

/**
 * Store mode. Waits until it is settled whose saved data this phone may show (and any
 * other user's has been cleared), then mounts per verified user.
 */
function Store() {
  const { ready, verifiedUserId } = useOfflineIdentity();
  if (!ready) return <StoreSkeleton />;
  return <StoreFor key={verifiedUserId ?? "nobody"} owner={verifiedUserId} />;
}

/** The server's list when it has answered, else the copy saved for this user. */
function StoreFor({ owner }: { owner: string | null }) {
  const { isAuthenticated } = useConvexAuth();
  const live = useQuery(currentList, isAuthenticated ? {} : "skip");
  const saved = useListSnapshot(live, owner);
  const ops = useListOps(owner);

  const base = live !== undefined ? live : saved?.list;

  if (base === undefined) {
    return saved === null && !ops.online ? <NoSignal pending={ops.pending} /> : <StoreSkeleton />;
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
