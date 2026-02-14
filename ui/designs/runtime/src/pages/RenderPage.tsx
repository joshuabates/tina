import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { loadVariationComponent } from "../registry/index.ts";

export function RenderPage() {
  const { designSlug = "", variationSlug = "" } = useParams();
  const [Component, setComponent] = useState<ComponentType | null>(null);

  useEffect(() => {
    let active = true;
    loadVariationComponent(designSlug, variationSlug).then((comp) => {
      if (active && comp) setComponent(() => comp);
    });
    return () => {
      active = false;
    };
  }, [designSlug, variationSlug]);

  if (!Component) return null;
  return <Component />;
}
