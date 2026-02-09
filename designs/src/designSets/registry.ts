import type { ComponentType } from "react";

export type DesignPhase = "wireframe" | "design";

export interface DesignSetMeta {
  slug: string;
  title: string;
  description: string;
  phase: DesignPhase;
  tags: string[];
}

type MetaModule = { default: DesignSetMeta };
type ViewModule = { default: ComponentType };

const metaModules = import.meta.glob("./*/meta.ts", { eager: true }) as Record<string, MetaModule>;
const viewModules = import.meta.glob("./*/index.tsx") as Record<string, () => Promise<ViewModule>>;

function slugFromPath(path: string): string | null {
  const match = path.match(/^\.\/([^/]+)\/meta\.ts$/);
  return match?.[1] ?? null;
}

const sets = Object.entries(metaModules)
  .map(([path, module]) => {
    const inferredSlug = slugFromPath(path);
    if (!inferredSlug) {
      return null;
    }

    return {
      ...module.default,
      slug: module.default.slug || inferredSlug,
    };
  })
  .filter((set): set is DesignSetMeta => Boolean(set))
  .sort((a, b) => a.title.localeCompare(b.title));

export function listDesignSets(): DesignSetMeta[] {
  return sets;
}

export function findDesignSet(slug: string): DesignSetMeta | undefined {
  return sets.find((set) => set.slug === slug);
}

export async function loadDesignSetComponent(slug: string): Promise<ComponentType | null> {
  const loader = viewModules[`./${slug}/index.tsx`];
  if (!loader) {
    return null;
  }

  const module = await loader();
  return module.default;
}
