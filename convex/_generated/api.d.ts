/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as actions from "../actions.js";
import type * as events from "../events.js";
import type * as nodes from "../nodes.js";
import type * as orchestrations from "../orchestrations.js";
import type * as phases from "../phases.js";
import type * as tasks from "../tasks.js";
import type * as teamMembers from "../teamMembers.js";

declare const fullApi: ApiFromModules<{
  actions: typeof actions;
  events: typeof events;
  nodes: typeof nodes;
  orchestrations: typeof orchestrations;
  phases: typeof phases;
  tasks: typeof tasks;
  teamMembers: typeof teamMembers;
}>;

export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
