import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ScrollToTop } from "./components/ScrollToTop";

import Index from "./pages/Index";
import { Explore } from "./pages/Explore";
import Dashboard from "./pages/Dashboard";
import { NIP19Page } from "./pages/NIP19Page";
import { Terms } from "./pages/Terms";
import { Privacy } from "./pages/Privacy";
import NotFound from "./pages/NotFound";

export function AppRouter() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/explore" element={<Explore />} />
        <Route path="/dashboard/*" element={<Dashboard />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        {/* NIP-19 route for npub1, note1, naddr1, nevent1, nprofile1 */}
        <Route path="/:nip19" element={<NIP19Page />} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
export default AppRouter;