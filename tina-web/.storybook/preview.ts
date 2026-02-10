import type { Preview } from "@storybook/react";
import "../src/index.css";
import theme from "./theme";

const preview: Preview = {
  parameters: {
    docs: { theme },
    backgrounds: {
      default: "dark",
      values: [
        { name: "dark", value: "#020617" },
        { name: "card", value: "#0b1222" },
      ],
    },
    layout: "centered",
    options: {
      storySort: {
        order: ["Foundations", "Primitives", "Domain", "App"],
      },
    },
  },
};

export default preview;
