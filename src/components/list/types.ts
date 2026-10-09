import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";

// Client-side shape of `api.lists.current`, derived from the query so the store screen
// and the offline overlay can never drift from what Convex returns.
export type CurrentList = NonNullable<FunctionReturnType<typeof api.lists.current>>;
export type ListSection = CurrentList["sections"][number];
export type ListItem = ListSection["items"][number];
export type ListStatus = ListItem["status"];

/** Statuses a tap can set; `onHand` is assigned by the generator, never by a person. */
export type TapStatus = Exclude<ListStatus, "onHand">;
