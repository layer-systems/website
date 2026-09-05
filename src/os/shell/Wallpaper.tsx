/**
 * Layered-strata wallpaper echoing the LAYER.systems brand motif: soft
 * horizontal bands drifting slowly behind the desktop. Respects
 * prefers-reduced-motion by disabling the drift animation via CSS.
 */
export function Wallpaper() {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden bg-background" aria-hidden="true">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-muted/30" />
      <div className="os-wallpaper-layer absolute -inset-x-1/4 top-[8%] h-40 rotate-[-4deg] bg-gradient-to-r from-primary/10 via-primary/5 to-transparent blur-2xl" />
      <div className="os-wallpaper-layer os-wallpaper-layer-slow absolute -inset-x-1/4 top-[32%] h-56 rotate-[3deg] bg-gradient-to-r from-transparent via-primary/10 to-primary/5 blur-3xl" />
      <div className="os-wallpaper-layer absolute -inset-x-1/4 top-[58%] h-48 rotate-[-2deg] bg-gradient-to-r from-primary/5 via-primary/10 to-transparent blur-2xl" />
      <div className="os-wallpaper-layer os-wallpaper-layer-slow absolute -inset-x-1/4 top-[82%] h-40 rotate-[4deg] bg-gradient-to-r from-transparent via-primary/5 to-primary/10 blur-3xl" />
    </div>
  );
}
