/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONVEX_URL?: string;
  readonly VITE_CONVEX_URL_PROD?: string;
  readonly VITE_CONVEX_URL_DEV?: string;
  readonly VITE_TINA_ENV?: "prod" | "dev";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
