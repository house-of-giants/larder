/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as closeout from "../closeout.js";
import type * as cooking from "../cooking.js";
import type * as events from "../events.js";
import type * as health from "../health.js";
import type * as households from "../households.js";
import type * as ingredients from "../ingredients.js";
import type * as leftovers from "../leftovers.js";
import type * as lib_amounts from "../lib/amounts.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_deductions from "../lib/deductions.js";
import type * as lib_dev_only from "../lib/dev_only.js";
import type * as lib_household from "../lib/household.js";
import type * as lib_ledger from "../lib/ledger.js";
import type * as lib_list_generation from "../lib/list_generation.js";
import type * as lib_pantry from "../lib/pantry.js";
import type * as lib_prepared_food from "../lib/prepared_food.js";
import type * as lib_quantities from "../lib/quantities.js";
import type * as lib_reversals from "../lib/reversals.js";
import type * as lib_weeks from "../lib/weeks.js";
import type * as lists from "../lists.js";
import type * as pantry from "../pantry.js";
import type * as recipes from "../recipes.js";
import type * as seed from "../seed.js";
import type * as test_helpers from "../test_helpers.js";
import type * as testing from "../testing.js";
import type * as undo from "../undo.js";
import type * as weeks from "../weeks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  closeout: typeof closeout;
  cooking: typeof cooking;
  events: typeof events;
  health: typeof health;
  households: typeof households;
  ingredients: typeof ingredients;
  leftovers: typeof leftovers;
  "lib/amounts": typeof lib_amounts;
  "lib/auth": typeof lib_auth;
  "lib/deductions": typeof lib_deductions;
  "lib/dev_only": typeof lib_dev_only;
  "lib/household": typeof lib_household;
  "lib/ledger": typeof lib_ledger;
  "lib/list_generation": typeof lib_list_generation;
  "lib/pantry": typeof lib_pantry;
  "lib/prepared_food": typeof lib_prepared_food;
  "lib/quantities": typeof lib_quantities;
  "lib/reversals": typeof lib_reversals;
  "lib/weeks": typeof lib_weeks;
  lists: typeof lists;
  pantry: typeof pantry;
  recipes: typeof recipes;
  seed: typeof seed;
  test_helpers: typeof test_helpers;
  testing: typeof testing;
  undo: typeof undo;
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
