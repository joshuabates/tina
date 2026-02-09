import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar))",
          foreground: "hsl(var(--sidebar-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        border: "hsl(var(--border))",
        ring: "hsl(var(--ring))",
        status: {
          complete: "hsl(var(--status-complete))",
          executing: "hsl(var(--status-executing))",
          active: "hsl(var(--status-active))",
          planning: "hsl(var(--status-planning))",
          blocked: "hsl(var(--status-blocked))",
          warning: "hsl(var(--status-warning))",
        },
      },
      fontFamily: {
        display: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      fontSize: {
        "2xs": ["9px", { lineHeight: "12px" }],
        xs: ["11px", { lineHeight: "14px" }],
        sm: ["13px", { lineHeight: "18px" }],
        base: ["13px", { lineHeight: "20px" }],
        lg: ["15px", { lineHeight: "22px" }],
        xl: ["17px", { lineHeight: "24px" }],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
} satisfies Config;
