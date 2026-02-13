import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ConvexProvider } from "convex/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { convex } from "./convex";
import { RuntimeProvider } from "./providers/RuntimeProvider";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ConvexProvider client={convex}>
        <RuntimeProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </RuntimeProvider>
      </ConvexProvider>
    </QueryClientProvider>
  </StrictMode>,
);
