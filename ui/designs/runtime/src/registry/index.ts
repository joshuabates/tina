import type { ComponentType } from "react";
import type {
  DesignEntry,
  DesignMeta,
  MetaModule,
  VariationEntry,
  VariationMeta,
  ViewModule,
} from "../types.ts";

// Eagerly load design-level meta (optional per design)
const designMetaModules = import.meta.glob<MetaModule>("@sets/*/meta.ts", {
  eager: true,
});

// Eagerly load variation-level meta
const variationMetaModules = import.meta.glob<MetaModule>(
  "@sets/*/*/meta.ts",
  { eager: true },
);

// Lazy-load variation components
const variationViewModules = import.meta.glob<ViewModule>(
  "@sets/*/*/index.tsx",
);

function slugFromDesignPath(path: string): string | null {
  // Matches: @sets/<design-slug>/meta.ts or ../../sets/<design-slug>/meta.ts
  const match = path.match(/\/([^/]+)\/meta\.ts$/);
  return match?.[1] ?? null;
}

function slugsFromVariationPath(
  path: string,
): { designSlug: string; variationSlug: string } | null {
  // Matches: @sets/<design>/<variation>/meta.ts
  const match = path.match(/\/([^/]+)\/([^/]+)\/meta\.ts$/);
  if (!match) return null;
  return { designSlug: match[1], variationSlug: match[2] };
}

function slugsFromViewPath(
  path: string,
): { designSlug: string; variationSlug: string } | null {
  const match = path.match(/\/([^/]+)\/([^/]+)\/index\.tsx$/);
  if (!match) return null;
  return { designSlug: match[1], variationSlug: match[2] };
}

function slugToTitle(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Build design entries from meta modules
const designMetaMap = new Map<string, DesignMeta>();
for (const [path, module] of Object.entries(designMetaModules)) {
  const slug = slugFromDesignPath(path);
  if (!slug) continue;
  designMetaMap.set(slug, { slug, ...module.default });
}

// Build variation entries
const variationsByDesign = new Map<string, VariationEntry[]>();
for (const [path, module] of Object.entries(variationMetaModules)) {
  const slugs = slugsFromVariationPath(path);
  if (!slugs) continue;
  const meta = module.default as VariationMeta;
  const entry: VariationEntry = {
    designSlug: slugs.designSlug,
    slug: meta.slug || slugs.variationSlug,
    title: meta.title || slugToTitle(slugs.variationSlug),
    description: meta.description,
    status: meta.status,
    phase: meta.phase,
    tags: meta.tags,
  };
  const existing = variationsByDesign.get(slugs.designSlug) ?? [];
  existing.push(entry);
  variationsByDesign.set(slugs.designSlug, existing);
}

// Also discover variations that have index.tsx but no meta.ts
for (const path of Object.keys(variationViewModules)) {
  const slugs = slugsFromViewPath(path);
  if (!slugs) continue;
  const existing = variationsByDesign.get(slugs.designSlug) ?? [];
  if (existing.some((v) => v.slug === slugs.variationSlug)) continue;
  existing.push({
    designSlug: slugs.designSlug,
    slug: slugs.variationSlug,
    title: slugToTitle(slugs.variationSlug),
  });
  variationsByDesign.set(slugs.designSlug, existing);
}

// Build final design entries
const designs: DesignEntry[] = [];

// Collect all design slugs from both sources
const allDesignSlugs = new Set<string>([
  ...designMetaMap.keys(),
  ...variationsByDesign.keys(),
]);

for (const slug of allDesignSlugs) {
  const meta = designMetaMap.get(slug);
  const variations = variationsByDesign.get(slug) ?? [];
  designs.push({
    slug,
    title: meta?.title ?? slugToTitle(slug),
    prompt: meta?.prompt,
    tags: meta?.tags ?? [],
    variations: variations.sort((a, b) => a.title.localeCompare(b.title)),
  });
}

designs.sort((a, b) => a.title.localeCompare(b.title));

export function listDesigns(): DesignEntry[] {
  return designs;
}

export function findDesign(slug: string): DesignEntry | undefined {
  return designs.find((d) => d.slug === slug);
}

export function findVariation(
  designSlug: string,
  variationSlug: string,
): VariationEntry | undefined {
  const design = findDesign(designSlug);
  return design?.variations.find((v) => v.slug === variationSlug);
}

export async function loadVariationComponent(
  designSlug: string,
  variationSlug: string,
): Promise<ComponentType | null> {
  // Try each possible resolved path pattern
  for (const [path, loader] of Object.entries(variationViewModules)) {
    const slugs = slugsFromViewPath(path);
    if (
      slugs &&
      slugs.designSlug === designSlug &&
      slugs.variationSlug === variationSlug
    ) {
      const module = await loader();
      return module.default;
    }
  }
  return null;
}
