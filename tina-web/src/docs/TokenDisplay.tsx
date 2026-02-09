import type { ReactNode } from "react";

interface ColorSwatchProps {
  name: string;
  cssVar: string;
  tailwind: string;
  hex: string;
}

export function ColorSwatch({ name, cssVar, tailwind, hex }: ColorSwatchProps) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-card p-3">
      <div
        className="h-12 w-12 shrink-0 rounded-md border border-white/10"
        style={{ backgroundColor: `hsl(var(${cssVar}))` }}
      />
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{name}</div>
        <div className="font-mono text-xs text-muted-foreground">
          {tailwind}
        </div>
        <div className="font-mono text-xs text-muted-foreground">{hex}</div>
      </div>
    </div>
  );
}

export function ColorGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {children}
    </div>
  );
}

interface TypeSampleProps {
  name: string;
  tailwind: string;
  size: string;
  lineHeight: string;
}

export function TypeSample({
  name,
  tailwind,
  size,
  lineHeight,
}: TypeSampleProps) {
  return (
    <div className="flex items-baseline gap-4 border-b border-border py-3">
      <div className="w-20 shrink-0 font-mono text-xs text-muted-foreground">
        {tailwind}
      </div>
      <div
        className="text-foreground"
        style={{ fontSize: size, lineHeight }}
      >
        {name} &mdash; The quick brown fox jumps over the lazy dog
      </div>
      <div className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
        {size}/{lineHeight}
      </div>
    </div>
  );
}

interface FontFamilySampleProps {
  name: string;
  tailwind: string;
  family: string;
}

export function FontFamilySample({
  name,
  tailwind,
  family,
}: FontFamilySampleProps) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="mb-2 font-mono text-xs text-muted-foreground">
        {tailwind}
      </div>
      <div className="text-lg text-foreground" style={{ fontFamily: family }}>
        {name}
      </div>
      <div
        className="mt-1 text-sm text-muted-foreground"
        style={{ fontFamily: family }}
      >
        ABCDEFGHIJKLMNOPQRSTUVWXYZ
        <br />
        abcdefghijklmnopqrstuvwxyz
        <br />
        0123456789
      </div>
    </div>
  );
}

interface SpacingRowProps {
  name: string;
  rem: string;
  px: string;
}

export function SpacingRow({ name, rem, px }: SpacingRowProps) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="w-10 shrink-0 text-right font-mono text-xs text-muted-foreground">
        {name}
      </div>
      <div
        className="h-3 rounded-sm bg-primary"
        style={{ width: px }}
      />
      <div className="font-mono text-xs text-muted-foreground">
        {rem} ({px})
      </div>
    </div>
  );
}

interface RadiusSampleProps {
  name: string;
  tailwind: string;
  value: string;
}

export function RadiusSample({ name, tailwind, value }: RadiusSampleProps) {
  return (
    <div className="flex items-center gap-4">
      <div
        className="h-16 w-16 shrink-0 border-2 border-primary bg-primary/20"
        style={{ borderRadius: value }}
      />
      <div>
        <div className="text-sm font-medium text-foreground">{name}</div>
        <div className="font-mono text-xs text-muted-foreground">
          {tailwind}
        </div>
        <div className="font-mono text-xs text-muted-foreground">{value}</div>
      </div>
    </div>
  );
}

export function TokenSection({ children }: { children: ReactNode }) {
  return <div className="space-y-3">{children}</div>;
}
