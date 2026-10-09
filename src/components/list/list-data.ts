import { api } from "../../../convex/_generated/api";

// The one place store mode touches Convex.
export const currentList = api.lists.current;
export const setItemStatus = api.lists.setItemStatus;
export const addItem = api.lists.addItem;
