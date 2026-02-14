import { Navigate, Route, Routes } from "react-router-dom";
import { HomePage } from "./pages/HomePage.tsx";
import { DesignPage } from "./pages/DesignPage.tsx";
import { RenderPage } from "./pages/RenderPage.tsx";
import { ComparePage } from "./compare/ComparePage.tsx";

export default function App() {
  return (
    <div className="min-h-screen text-slate-900">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route
          path="/designs/:designSlug"
          element={<DesignPage />}
        />
        <Route
          path="/designs/:designSlug/:variationSlug"
          element={<DesignPage />}
        />
        <Route path="/render/:designSlug/:variationSlug" element={<RenderPage />} />
        <Route path="/compare/:designSlug/:variationSlug" element={<ComparePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
