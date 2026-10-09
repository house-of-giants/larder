/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as events from "../events.js";
import type * as health from "../health.js";
import type * as households from "../households.js";
import type * as ingredients from "../ingredients.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_household from "../lib/household.js";
import type * as lib_ledger from "../lib/ledger.js";
import type * as lib_list_generation from "../lib/list_generation.js";
import type * as lib_pantry from "../lib/pantry.js";
import type * as lib_quantities from "../lib/quantities.js";
import type * as lib_weeks from "../lib/weeks.js";
import type * as lists from "../lists.js";
import type * as pantry from "../pantry.js";
import type * as recipes from "../recipes.js";
import type * as seed from "../seed.js";
import type * as test_helpers from "../test_helpers.js";
import type * as testing from "../testing.js";
import type * as weeks from "../weeks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  events: typeof events;
  health: typeof health;
  households: typeof households;
  ingredients: typeof ingredients;
  "lib/auth": typeof lib_auth;
  "lib/household": typeof lib_household;
  "lib/ledger": typeof lib_ledger;
  "lib/list_generation": typeof lib_list_generation;
  "lib/pantry": typeof lib_pantry;
  "lib/quantities": typeof lib_quantities;
  "lib/weeks": typeof lib_weeks;
  lists: typeof lists;
  pantry: typeof pantry;
  recipes: typeof recipes;
  seed: typeof seed;
  test_helpers: typeof test_helpers;
  testing: typeof testing;
  weeks: typeof weeks;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
