/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as assumptions from "../assumptions.js";
import type * as deliverables from "../deliverables.js";
import type * as dependencies from "../dependencies.js";
import type * as issues from "../issues.js";
import type * as model_deliverables from "../model/deliverables.js";
import type * as model_derived from "../model/derived.js";
import type * as model_programs from "../model/programs.js";
import type * as programs from "../programs.js";
import type * as risks from "../risks.js";
import type * as seed from "../seed.js";
import type * as teams from "../teams.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  assumptions: typeof assumptions;
  deliverables: typeof deliverables;
  dependencies: typeof dependencies;
  issues: typeof issues;
  "model/deliverables": typeof model_deliverables;
  "model/derived": typeof model_derived;
  "model/programs": typeof model_programs;
  programs: typeof programs;
  risks: typeof risks;
  seed: typeof seed;
  teams: typeof teams;
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
