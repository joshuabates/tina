import { Route, Routes } from "react-router-dom"

function PlaceholderPage() {
  return (
    <div className="flex items-center justify-center h-screen text-muted-foreground">
      tina-web rebuild — phase 1 infrastructure
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="*" element={<PlaceholderPage />} />
    </Routes>
  )
}
