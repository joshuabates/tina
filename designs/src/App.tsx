import { Navigate, Route, Routes } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { DesignSetPage } from "./pages/DesignSetPage";

export default function App() {
  return (
    <div className="min-h-screen text-slate-900">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/sets/:setSlug" element={<DesignSetPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

