/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as actions from "../actions.js";
import type * as admin from "../admin.js";
import type * as commits from "../commits.js";
import type * as controlPlane from "../controlPlane.js";
import type * as cron from "../cron.js";
import type * as crons from "../crons.js";
import type * as deleteHelpers from "../deleteHelpers.js";
import type * as designs from "../designs.js";
import type * as events from "../events.js";
import type * as executionTasks from "../executionTasks.js";
import type * as generated_orchestrationCore from "../generated/orchestrationCore.js";
import type * as nodes from "../nodes.js";
import type * as orchestrations from "../orchestrations.js";
import type * as phases from "../phases.js";
import type * as plans from "../plans.js";
import type * as policyPresets from "../policyPresets.js";
import type * as projectCounters from "../projectCounters.js";
import type * as projects from "../projects.js";
import type * as supervisorStates from "../supervisorStates.js";
import type * as tasks from "../tasks.js";
import type * as teamMembers from "../teamMembers.js";
import type * as teams from "../teams.js";
import type * as telemetry from "../telemetry.js";
import type * as test_helpers from "../test_helpers.js";
import type * as tickets from "../tickets.js";
import type * as workComments from "../workComments.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  actions: typeof actions;
  admin: typeof admin;
  commits: typeof commits;
  controlPlane: typeof controlPlane;
  cron: typeof cron;
  crons: typeof crons;
  deleteHelpers: typeof deleteHelpers;
  designs: typeof designs;
  events: typeof events;
  executionTasks: typeof executionTasks;
  "generated/orchestrationCore": typeof generated_orchestrationCore;
  nodes: typeof nodes;
  orchestrations: typeof orchestrations;
  phases: typeof phases;
  plans: typeof plans;
  policyPresets: typeof policyPresets;
  projectCounters: typeof projectCounters;
  projects: typeof projects;
  supervisorStates: typeof supervisorStates;
  tasks: typeof tasks;
  teamMembers: typeof teamMembers;
  teams: typeof teams;
  telemetry: typeof telemetry;
  test_helpers: typeof test_helpers;
  tickets: typeof tickets;
  workComments: typeof workComments;
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
