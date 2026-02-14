import type { ComponentType } from "react";

export type DesignStatus = "exploring" | "locked" | "archived";
export type VariationStatus = "exploring" | "selected" | "rejected";

export interface DesignMeta {
  slug: string;
  title: string;
  prompt?: string;
  tags?: string[];
}

export interface VariationMeta {
  slug: string;
  title: string;
  description?: string;
  status?: VariationStatus;
  phase?: string;
  tags?: string[];
}

export interface DesignEntry {
  slug: string;
  title: string;
  prompt?: string;
  tags: string[];
  variations: VariationEntry[];
}

export interface VariationEntry {
  designSlug: string;
  slug: string;
  title: string;
  description?: string;
  status?: VariationStatus;
  phase?: string;
  tags?: string[];
}

export type MetaModule = { default: DesignMeta | VariationMeta };
export type ViewModule = { default: ComponentType };
