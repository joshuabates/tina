import { ConvexReactClient } from "convex/react";

const explicitUrl = import.meta.env.VITE_CONVEX_URL;
const requestedEnv = (import.meta.env.VITE_TINA_ENV ?? "prod").toLowerCase();
const env = requestedEnv === "dev" ? "dev" : "prod";
const profileUrl =
  env === "dev" ? import.meta.env.VITE_CONVEX_URL_DEV : import.meta.env.VITE_CONVEX_URL_PROD;

const convexUrl = explicitUrl ?? profileUrl;

if (!convexUrl) {
  throw new Error(
    "Missing Convex URL. Set VITE_CONVEX_URL or VITE_CONVEX_URL_PROD/VITE_CONVEX_URL_DEV.",
  );
}

export const convex = new ConvexReactClient(convexUrl);
