import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ScrollToTop } from "./components/ScrollToTop";

import Index from "./pages/Index";
import { Desktop } from "./os/Desktop";
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
        {/* The desktop-OS shell (see docs/DESKTOP_OS.md). /os/<app-path> deep-links
            into the shell with that app already open, then normalizes to /os. */}
        <Route path="/os/*" element={<Desktop />} />
        {/* Legacy page routes now open their app inside the desktop shell. */}
        <Route path="/explore" element={<Navigate to="/os/explore" replace />} />
        <Route path="/dashboard" element={<Navigate to="/os/dashboard" replace />} />
        <Route path="/dashboard/events" element={<Navigate to="/os/dashboard/events" replace />} />
        <Route path="/dashboard/export" element={<Navigate to="/os/dashboard/export" replace />} />
        <Route path="/messages" element={<Navigate to="/os/messages" replace />} />
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