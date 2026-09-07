# PLAN.md — Nostr Layer Systems "Web OS"

## 1. Vision

Die App ist kein klassisches Website-Layout mit Navigation und Unterseiten, sondern
ein **Desktop-Betriebssystem im Browser**. Jede frühere „Page" wird zu einer **App**,
die als Fenster geöffnet, verschoben, skaliert, minimiert, maximiert und geschlossen
werden kann.

Optisch: **macOS-Grundstruktur, PostHog-Ästhetik.**

- macOS liefert die *Mechanik*: Menüleiste oben, Fenster mit Titelleiste, Traffic-Light-Buttons,
  Fokus/Z-Order.
- [posthog.com](https://posthog.com) liefert die *Optik*: hell, ruhig, viel Weißraum,
  flache Flächen statt Glaseffekt-Orgie, kräftige aber sparsame Akzentfarbe,
  klare Typo-Hierarchie, dezente 1px-Rahmen, leicht verspielte Details ohne Skeuomorphismus.

**Nicht-Ziel:** kein Fake-macOS-Klon mit Apple-Icons, keine Glassmorphism-Überladung,
keine Emulator-Spielerei. Das OS ist eine Metapher für Multitasking, nicht Selbstzweck.

---

## 2. Ausgangslage (Stand heute)

Das Repo ist der Startpunkt für LAYER.systems:

- `src/AppRouter.tsx` — drei Routen: `/`, `/:nip19`, `*`
- `src/pages/` — `Index.tsx` (Platzhalter), `NIP19Page.tsx`, `NotFound.tsx`
- `src/components/ui/` — vollständiges shadcn/ui-Set (48+ Komponenten)
- Nostr-Infrastruktur vorhanden: `NostrProvider`, `useNostr`, `useAuthor`,
  `useCurrentUser`, `useNostrPublish`, `useUploadFile`, `LoginArea`
- Theming über CSS-Variablen in `src/index.css` (`:root` / `.dark`), `useTheme`

Es gibt also **noch keine Feature-Seiten, die migriert werden müssten** — der Window-Manager
kann von Anfang an als Fundament gebaut werden, statt nachträglich übergestülpt zu werden.
Das ist der günstigste Zeitpunkt für diese Architektur.

**Dependencies sparsam.** Drag/Resize wird mit Pointer-Events selbst implementiert
(~150 Zeilen), weil dnd-Bibliotheken für Fenster-Dragging überdimensioniert sind und wir
volle Kontrolle über Snapping, Grenzen und Touch-Verhalten brauchen. Ebenso kein neues
State-Lib — `useReducer` + Context genügen. Einzige Neuzugänge sind die drei
Markdown-Pakete für die Artikel-App (§6.1), die ausschließlich in deren Lazy-Chunk landen.

---

## 3. Architektur

### 3.1 Schichtenmodell

```
┌─────────────────────────────────────────────┐
│ MenuBar          (fix, oben, 28px)          │  z-index 100
├─────────────────────────────────────────────┤
│                                             │
│   Desktop  (Wallpaper + App-Icons)          │  z-index 0
│                                             │
│      ┌──────────────┐                       │
│      │ WindowFrame  │  ┌──────────────┐     │  z-index 10..99
│      │              │  │ WindowFrame  │     │  (Stapel nach Fokus)
│      └──────────────┘  └──────────────┘     │
│                                             │
├─────────────────────────────────────────────┤
└─────────────────────────────────────────────┘
        (kein Dock — volle Desktopfläche)
```

### 3.2 Neue Verzeichnisstruktur

```
src/
  os/
    registry.ts            # App-Registry: Single Source of Truth
    types.ts               # AppDefinition, WindowState, ...
    WindowManagerContext.ts
    WindowManagerProvider.tsx
    windowReducer.ts       # reine Reducer-Logik (gut testbar)
    useWindowManager.ts
    useDrag.ts             # Pointer-basiertes Drag
    useResize.ts           # Pointer-basiertes Resize (8 Handles)
    layout.ts              # Kaskade, Snapping, Clamping, Zentrierung
    persistence.ts         # localStorage-Serialisierung
  components/os/
    Desktop.tsx            # Wallpaper + Icon-Grid + Marquee-Auswahl
    DesktopIcon.tsx
    MenuBar.tsx            # macOS-Leiste oben
    MenuBarClock.tsx
    WindowLayer.tsx        # rendert alle offenen Fenster
    WindowFrame.tsx        # Chrome: Titlebar, Traffic Lights, Resize-Handles
    TrafficLights.tsx
    MobileAppShell.tsx     # Fullscreen-Fallback für Mobile
    AppChrome.tsx          # Toolbar/Sidebar-Bausteine für App-Inhalte
  apps/
    <app-id>/
      index.tsx            # der Fenster-Inhalt
      definition.ts        # Metadaten für die Registry
```

`src/pages/` bleibt bestehen, schrumpft aber auf: `Index.tsx` (rendert nur noch
den `<Desktop />`-Shell), `NIP19Page.tsx`, `NotFound.tsx`.

### 3.3 App-Registry

Die Registry ist der zentrale Katalog. Eine neue App hinzufügen = **ein Eintrag**,
keine Router-Änderung, kein Menü-Update, kein Icon-Grid-Update.

```ts
// src/os/types.ts
export interface AppDefinition {
  id: string;                    // 'feed', 'settings', 'profile'
  title: string;                 // "Feed"
  icon: LucideIcon;
  category: 'social' | 'tools' | 'system';
  component: React.LazyExoticComponent<React.ComponentType<AppProps>>;
  defaultSize: { width: number; height: number };
  minSize?: { width: number; height: number };
  resizable?: boolean;           // default true
  singleton?: boolean;           // nur eine Instanz (z.B. Settings) — default true
  showOnDesktop?: boolean;       // default true
  requiresAuth?: boolean;        // zeigt Login-Prompt statt Inhalt
}

export interface AppProps {
  windowId: string;
  params?: Record<string, string>;   // z.B. { npub: '...' } bei Deep-Link
  setTitle: (title: string) => void; // App kann Fenstertitel setzen
}
```

Alle App-Komponenten werden per `React.lazy()` geladen → das initiale Bundle enthält
nur den Shell. Ein Fenster ist ein Code-Split-Punkt. `<Suspense>` in `WindowFrame`
zeigt einen Skeleton-Inhalt.

### 3.4 Window-State

```ts
export interface WindowState {
  id: string;              // nanoid-artig, `${appId}-${counter}`
  appId: string;
  title: string;
  x: number; y: number;    // Position relativ zum Desktop-Bereich
  width: number; height: number;
  z: number;               // Stapelreihenfolge
  minimized: boolean;
  maximized: boolean;
  prevRect?: Rect;         // Rect vor dem Maximieren (für Restore)
  params?: Record<string, string>;
}
```

Verwaltung über `useReducer` + Context (`WindowManagerProvider`), **kein neues
State-Lib**. Actions:

`OPEN_APP` · `CLOSE_WINDOW` · `FOCUS_WINDOW` · `MOVE_WINDOW` · `RESIZE_WINDOW` ·
`MINIMIZE` · `RESTORE` · `TOGGLE_MAXIMIZE` · `SET_TITLE` · `CLOSE_ALL` · `HYDRATE`

Wichtige Reducer-Regeln:

- `OPEN_APP` bei `singleton: true` und bereits offenem Fenster → fokussieren +
  ggf. entminimieren statt neue Instanz.
- `z` wird beim Fokussieren auf `maxZ + 1` gesetzt. Bei `z > 9000` einmalig
  normalisieren (alle Fenster neu durchnummerieren), um Overflow-Drift zu vermeiden.
- Neue Fenster erscheinen **kaskadiert** (je +28px x/y, Reset nach 6 Fenstern),
  auf sichtbaren Bereich geclamped, initial mittig-versetzt.

**Performance:** Während Drag/Resize wird die Position **nicht** in den Reducer
geschrieben (das würde bei jedem Pointer-Move alle Fenster neu rendern). Stattdessen
schreibt das Drag-Hook direkt per `transform` auf das DOM-Element und dispatcht
**einmal auf `pointerup`**. Zusätzlich bekommt jedes `WindowFrame` ein `React.memo`.

### 3.5 Routing & Deep-Links

Der bestehende Router bleibt intakt (Vorgabe aus `AGENTS.md`: `/:nip19` darf nicht
verschachtelt werden). Der OS-Zustand lebt im **Query-String**:

```
/                              → Desktop, keine Fenster (oder wiederhergestellte Session)
/?app=feed                     → Desktop mit geöffnetem Feed-Fenster
/?app=profile&npub=npub1...    → Profil-App mit Parameter
/npub1abc...                   → NIP19Page: öffnet Desktop + passende App im Fenster
```

- `Index.tsx` liest beim Mount `?app=` und öffnet die entsprechenden Fenster.
- `NIP19Page.tsx` rendert ebenfalls den Desktop und öffnet je nach Identifier-Typ
  (`npub`/`nprofile` → Profil-App, `note`/`nevent` → Thread-App, `naddr` → Artikel-App)
  ein Fenster mit den dekodierten Parametern.
- Beim Fokuswechsel wird die URL per `replaceState` auf die aktive App aktualisiert,
  damit „Link kopieren" und Browser-Reload das Erwartete tun. Kein History-Spam:
  Fensterbewegungen schreiben **nie** in die URL.
- Jedes Fenster hat im Kontextmenü „Link kopieren".

### 3.6 Persistenz

`localStorage`-Key `nostr:os-session` (v1-versioniert):
offene Fenster, Positionen, Größen, Z-Order, Minimiert-Status.

- Beim Start: Hydration → jedes Fenster gegen aktuelle Viewport-Größe clampen
  (Fenster außerhalb des Bildschirms zurückholen).
- Unbekannte `appId` (App wurde entfernt) wird beim Hydrieren still verworfen.
- Alles in `try/catch`; kaputter/fehlender State ⇒ leerer Desktop, nie ein Crash.
- Schreiben debounced (300 ms).
- Im Menü: „Fenster › Alle schließen" und „Sitzung zurücksetzen".

---

## 4. Design-System (PostHog-Kalibrierung)

### 4.1 Farben

`src/index.css` wird angepasst — die vorhandenen Token-Namen bleiben (shadcn hängt
daran), nur die Werte ändern sich, plus neue OS-Token.

| Token | Light | Zweck |
|---|---|---|
| `--os-desktop` | `hsl(40 20% 96%)` | warmes Off-White als Wallpaper-Basis |
| `--background` | `hsl(0 0% 100%)` | Fenster-Inhalt |
| `--foreground` | `hsl(20 14% 12%)` | fast-schwarz, leicht warm |
| `--border` | `hsl(30 10% 88%)` | 1px-Hairlines |
| `--primary` | `hsl(265 85% 60%)` | Nostr-Violett als Akzent |
| `--os-titlebar` | `hsl(40 15% 98%)` | Titelleiste aktiv |
| `--os-titlebar-inactive` | `hsl(40 10% 96%)` | Titelleiste inaktiv |

Dark Mode ist gleichwertig, nicht Nachgedanke: `--os-desktop: hsl(24 10% 8%)`,
Fenster `hsl(24 8% 12%)`, Rahmen `hsl(24 6% 22%)`.

### 4.2 Materialien

- **Fenster:** `bg-background`, `border border-border`, `rounded-xl`,
  Schatten in zwei Stufen — fokussiert `shadow-2xl`, unfokussiert `shadow-md` +
  leicht reduzierte Deckkraft der Titelleiste. Der Fokus muss **auf einen Blick**
  erkennbar sein.
- **Menüleiste:** `backdrop-blur-md` + halbtransparentes Weiß. Der *einzige*
  Ort mit Blur — das hält es besonders statt beliebig.
- **Radius:** `--radius: 0.75rem` (bereits gesetzt) passt; Fenster `xl`, Buttons `md`.
- **Bewegung:** kurz und funktional. Öffnen 160 ms `scale(.96)→1` + Fade,
  Minimieren 200 ms Richtung Menüleiste, Schließen 120 ms Fade.
  Alles respektiert `prefers-reduced-motion` (dann: nur Opazität, keine Transforms).

### 4.3 Typografie

- UI-Text: System-Stack (`-apple-system, ui-sans-serif, …`), 13px Basis in Chrome-Flächen,
  14–15px in App-Inhalten.
- Überschriften in Apps: klar größer, `font-semibold`, `tracking-tight`.
- Monospace (`ui-monospace`) für technische Werte: Pubkeys, Event-IDs, Relay-URLs.

### 4.4 „App statt Website"

Damit sich Inhalte nicht wie Landingpages anfühlen, gilt für jeden App-Inhalt:

- **Keine** eigene Page-Kopfzeile mit riesigem H1 — der Fenstertitel ist die Überschrift.
- Kein zentrierter Content mit `max-w-4xl mx-auto` und viel Luft daneben; Layout
  füllt das Fenster (`h-full`, Flex/Grid).
- Scrollen passiert **innerhalb** des Fensters, nie auf `body`.
- Optionale App-Toolbar direkt unter der Titelleiste (Suche, Filter, Aktionen),
  36px hoch, `border-b`.
- Optionale App-Sidebar links (200–240px), wenn die App Navigation braucht —
  wie Mail.app oder Finder.
- Leerzustände sind knapp und handlungsorientiert („Noch keine Notizen · Neue anlegen"),
  keine Marketing-Illustrationen.
- Dichte statt Weite: Listenzeilen ~44px, keine Karten-mit-Riesenpadding.

---

## 5. Komponenten im Detail

### 5.1 MenuBar (oben, fix, 28px)

```
[◆ Logo] [App-Name ▾] [Datei ▾] [Ansicht ▾] [Fenster ▾]  ······  [Relays] [Theme] [Uhr] [Avatar ▾]
```

- **Links:** Logo-Menü (Über, Einstellungen…, Sitzung zurücksetzen).
- **App-Menü:** Name des *fokussierten* Fensters in `font-semibold` — der macOS-Kern-Trick,
  der die OS-Illusion trägt. Ohne Fokus: „Finder"-Äquivalent, hier „Desktop".
- **Fenster-Menü:** Liste aller offenen Fenster mit Häkchen beim aktiven, plus
  „Alle minimieren" / „Alle schließen".
- **Rechts:** Relay-Status (Punkt grün/gelb/rot + Anzahl verbundener Relays),
  Theme-Toggle, Uhrzeit (Locale-formatiert, minütlich aktualisiert), Login/Avatar
  (bestehende `LoginArea`, in Menü-Optik umgestylt).
- Umsetzung mit dem vorhandenen shadcn `menubar` bzw. `dropdown-menu` — Keyboard-Navigation
  und Fokus-Handling sind damit geschenkt.

### 5.2 Desktop

- Wallpaper: **feines Punktraster** (~22px Abstand, sehr geringer Kontrast) auf
  `--os-desktop`. Kein Foto, kein Verlauf — das Raster gibt Textur und Tiefe, ohne den
  Fensterinhalten Aufmerksamkeit zu stehlen. Umsetzung als CSS `radial-gradient` +
  `background-size`, ein einziger Token für die Punktfarbe (Light/Dark).
- Icon-Grid: oben links beginnend, spaltenweise nach unten (macOS-Konvention),
  ~80px Zellen, Icon + Label.
- Interaktion: einfacher Klick = Auswahl, **Doppelklick = öffnen** (Touch: einfacher Tap),
  Enter öffnet Auswahl, Pfeiltasten navigieren.
- Rechtsklick auf leere Fläche → Kontextmenü (Hintergrund wechseln, Symbole aufräumen,
  Alle Fenster schließen).

### 5.3 WindowFrame

- **Titelleiste** 36px: links Traffic Lights, mittig Titel (`truncate`, 13px, `font-medium`),
  rechts optionaler App-Aktionsslot.
- **Traffic Lights:** rot/gelb/grün, 12px, Symbole (×, −, ⤢) erscheinen erst beim
  Hover über die Gruppe. Unfokussiert alle grau.
  Jeweils echte `<button>` mit `aria-label` — nicht nur farbige `div`s.
- **Doppelklick auf Titelleiste** → maximieren/wiederherstellen.
- **Drag** nur an der Titelleiste; Fenster darf nicht unter die Menüleiste geschoben
  werden; mind. 60px müssen im Viewport bleiben.
- **Resize:** 8 Handles (4 Kanten je 6px, 4 Ecken je 12px), respektiert `minSize`.
- **Maximieren** = Vollfläche unterhalb der Menüleiste (kein Fullscreen-API).
- **Snapping (Phase 5):** Ziehen an den linken/rechten Rand → Halbseite,
  nach oben → maximiert; mit Vorschau-Overlay.

### 5.4 Tastatur

| Kürzel | Aktion |
|---|---|
| `⌘/Ctrl + W` | Fokussiertes Fenster schließen |
| `⌘/Ctrl + M` | Minimieren |
| `⌘/Ctrl + \`` | Nächstes Fenster |
| `⌘/Ctrl + K` | Spotlight / Command-Palette (nutzt vorhandenes `cmdk`) |
| `Esc` | Menü/Palette schließen |

Fokusfalle pro Fenster ist **nicht** gewünscht (Fenster sind nicht-modal), aber
Tab-Reihenfolge folgt der Z-Order, und ein neu geöffnetes Fenster bekommt den Fokus.

### 5.5 Mobile (< 768px)

Fenster-Management ergibt auf dem Handy keinen Sinn. Über `useIsMobile`:

- Menüleiste bleibt (kompakt: Logo, aktive App, Avatar).
- Desktop-Icons werden zum **App-Grid** wie ein Homescreen.
- Eine App öffnet **fullscreen** mit Zurück-Pfeil statt Traffic Lights.
- Offene Apps über einen „App-Switcher" (Liste) erreichbar.
- Kein Drag, kein Resize, keine Positionsspeicherung.

Damit gilt die Vorgabe „responsiv bis ~360px" ohne verkrüppelte Fenster-Metapher.

---

## 6. Die Apps

Sieben Apps für v1 — bewusst begrenzt, dafür jede wirklich fertig statt vieler halber:

| App | ID | Icon | Inhalt |
|---|---|---|---|
| Feed | `feed` | `Rss` | Globale/Follow-Timeline (kind 1), Composer, Antworten |
| Profil | `profile` | `User` | kind-0-Metadaten, Notizen des Autors, Follow-Button |
| Notizen | `notes` | `FileText` | Einzelne Notiz / Thread (aus `note1`/`nevent1`) |
| Einstellungen | `settings` | `Settings` | Theme, Relay-Verwaltung, Blossom-Server, Account |
| Über | `about` | `Info` | Was ist das, welche NIPs, Links |
| Relay-Monitor | `relays` | `Activity` | System-App: verbundene Relays, Latenz, Event-Durchsatz, Fehler |
| Artikel | `articles` | `BookOpen` | Long-form-Reader (NIP-23, kind 30023) aus `naddr1`, Markdown-Rendering |

Später: Nachrichten (NIP-17/44), Wallet (NIP-60).

**Hinweise zu den beiden Zusatz-Apps:**

- **Relay-Monitor** trägt das OS-Thema am stärksten und ist billig: er liest den
  Verbindungsstatus aus dem vorhandenen `NostrProvider`/Pool, misst Round-Trip-Zeiten
  und zeigt eine dichte Tabelle. Er speist zugleich die Relay-Anzeige in der Menüleiste
  (§5.1) — eine Datenquelle, zwei Oberflächen.
- **Artikel** rendert Markdown mit `react-markdown` (Wahl und Begründung siehe §6.1).

### 6.1 Markdown-Rendering (Artikel-App)

**Wahl: `react-markdown@10` + `remark-gfm@4` + `rehype-sanitize@6`.**

Der entscheidende Unterschied zu den Alternativen ist nicht Größe oder Geschwindigkeit,
sondern das Sicherheitsmodell:

| Kandidat | Ausgabe | Bewertung |
|---|---|---|
| **`react-markdown`** | React-Elementbaum | Ruft **nie** `innerHTML` auf. Roh-HTML im Markdown wird ohne das optionale `rehype-raw` gar nicht erst interpretiert. Sicher *by construction*. |
| `marked` | HTML-String | Schnell und winzig, erzwingt aber `dangerouslySetInnerHTML` + `DOMPurify`. Sicher nur, solange niemand den Sanitizer-Schritt vergisst. |
| `markdown-it` | HTML-String | Sehr erweiterbar, gleiche Schwäche wie `marked`; zusätzlich das größte Paket der drei. |

Bei Inhalten, die ungeprüft von fremden Relays kommen, ist „sicher, weil es gar nicht
anders geht" mehr wert als „sicher, wenn man daran gedacht hat". Deshalb `react-markdown`.

Zwei weitere Gründe, die konkret zu diesem Projekt passen:

- **`components`-Prop = Styling ohne CSS-Kampf.** Jedes Markdown-Element wird auf unsere
  eigenen Komponenten gemappt (`h1` → Fenster-Typo, `pre` → Code-Block mit Monospace-Token,
  `table` → shadcn-`Table`). Ein String-Renderer würde uns stattdessen in
  `prose`-Overrides zwingen.
- **Abgefangene Links tragen die OS-Metapher.** Über `components.a` lassen sich
  `nostr:`-URIs und `npub`/`naddr`-Erwähnungen abfangen und in **Fenster-Öffner** verwandeln
  (`openApp('profile', { npub })`) statt in Seitennavigation. Genau das ist der Punkt, an dem
  sich die App wie ein OS und nicht wie eine Website anfühlt — mit einem HTML-String wäre das
  nur über nachträgliches DOM-Patching machbar.

Konfiguration:

- `remark-gfm` für Tabellen, Strikethrough, Task-Listen und Autolinks — NIP-23-Artikel
  nutzen GFM in der Praxis regelmäßig.
- `rehype-sanitize` als zweite Verteidigungslinie. Streng genommen redundant, solange
  `rehype-raw` nicht aktiv ist, aber es kostet ~3 kB und schützt davor, dass eine spätere
  Änderung die Sicherheitsannahme still kippt.
- `urlTransform` zusätzlich eigenhändig setzen: nur `https:`, `http:`, `mailto:` und `nostr:`
  durchlassen, alles andere verwerfen (`javascript:`, `data:`).
- **`rehype-raw` wird nicht installiert.** Wer es später hinzufügen will, muss diese
  Entscheidung bewusst umstoßen.
- Der gesamte Block hängt am `React.lazy`-Chunk der Artikel-App und belastet das
  Start-Bundle nicht.

Bilder aus Artikeln laufen über die projektübliche `sanitizeUrl`-Prüfung (siehe
`nostr-security`), bevor sie ins `img`-Mapping gehen.

Jede App wird nach den Regeln aus §4.4 gebaut. Nostr-Datenzugriff ausschließlich über
die vorhandenen Hooks (`useNostr` + TanStack Query, `useAuthor`, `useNostrPublish`),
inkl. der projektüblichen Validierungsfunktion pro Event-Kind vor dem Rendern.

---

## 7. Umsetzung in Phasen

Jede Phase endet mit einem lauffähigen Stand und einem grünen `npm run test`.

### Phase 1 — Fundament (Window-Manager ohne Optik)
- `src/os/types.ts`, `registry.ts`, `windowReducer.ts`, `WindowManagerProvider`, `useWindowManager`
- `WindowManagerProvider` in `App.tsx` einhängen (innerhalb `TooltipProvider`)
- `Desktop` + `WindowLayer` + rudimentäres `WindowFrame` (öffnen/schließen/fokussieren)
- Eine Dummy-App zum Testen
- ✅ Ergebnis: Fenster lassen sich öffnen, fokussieren, schließen

### Phase 2 — Fenster-Interaktion
- `useDrag`, `useResize` (Pointer-Events, Direkt-DOM während der Geste)
- Maximieren/Wiederherstellen, Minimieren, Kaskadierung, Clamping
- `layout.ts` mit Viewport-Grenzen; Reaktion auf `resize` des Fensters
- ✅ Ergebnis: Fenster verhalten sich wie echte Fenster

### Phase 3 — macOS-Shell
- `MenuBar` mit App-Menü, Fenster-Menü, Uhr, Relay-Status, Theme-Toggle, Login
- `Desktop` mit Icon-Grid, Auswahl, Doppelklick-Öffnen, Kontextmenü
- Tastenkürzel
- ✅ Ergebnis: fühlt sich wie ein Desktop an

### Phase 4 — Visuelles Design
- `index.css`: neue Farbtoken (Light + Dark), OS-Token
- Fenster-Chrome finalisieren: Traffic Lights, Fokus-/Unfokus-Zustände, Schatten
- Animationen inkl. `prefers-reduced-motion`
- ✅ Ergebnis: PostHog-Look sitzt

### Phase 5 — Politur
- Minimier-/Restore-Animation Richtung Menüleiste
- Snapping an Ränder mit Vorschau
- Command-Palette (`⌘K`) über `cmdk`
- Persistenz + Session-Wiederherstellung
- ✅ Ergebnis: Reload stellt den Arbeitsplatz wieder her

### Phase 6 — Apps mit echtem Inhalt
- Feed, Profil, Notizen, Einstellungen, Über, Relay-Monitor, Artikel
- Deep-Link-Integration in `NIP19Page`
- Mobile-Shell
- ✅ Ergebnis: funktionierender Nostr-Client im OS-Gewand

---

## 8. Risiken und wie wir sie adressieren

| Risiko | Gegenmaßnahme |
|---|---|
| Ruckeln beim Ziehen vieler Fenster | Direktes DOM-`transform` während der Geste, Dispatch erst auf `pointerup`; `React.memo` pro Fenster |
| OS-Metapher nervt auf Mobile | Ab `< 768px` Fullscreen-Shell statt Fenster (§5.5) |
| Schlechte Zugänglichkeit ("hübsche divs") | Traffic Lights als echte Buttons mit `aria-label`, Fenster als `role="dialog" aria-label={title}`, vollständige Tastaturbedienung, sichtbare Fokusringe |
| SEO / Crawler sehen nur einen leeren Desktop | Pro geöffneter App `useSeoMeta` mit passendem Titel/Beschreibung setzen; `/:nip19`-Routen liefern echte Metadaten |
| Bundle wächst mit jeder App | Jede App per `React.lazy`, Suspense-Skeleton im Fenster |
| Gespeicherte Fenster liegen außerhalb des Viewports | Beim Hydrieren gegen aktuelle Größe clampen |
| Z-Index-Drift | Normalisierung ab `z > 9000` |
| Session-State inkompatibel nach Refactor | Versionsschlüssel im localStorage; unbekannte Version ⇒ verwerfen |

---

## 9. Getroffene Entscheidungen

Diese Punkte sind geklärt und in den Plan eingearbeitet:

| Frage | Entscheidung | Konsequenz |
|---|---|---|
| Dock | **Kein Dock** | Offene Fenster ausschließlich über das Fenster-Menü in der Menüleiste. Minimieren animiert dorthin. Volle Desktopfläche, weniger Code. |
| Akzentfarbe | **Nostr-Violett** `hsl(265 85% 60%)` | Eigene Identität statt PostHog-Klon, gleiche Helligkeit/Sättigung wie das Referenz-Orange. Grün bleibt für Statussignale reserviert. |
| Wallpaper | **Punktraster**, fix | Kein Preset-Umschalter, keine Persistenz dafür nötig. Ein Token für die Punktfarbe je Theme. |
| Markdown | **`react-markdown` + `remark-gfm` + `rehype-sanitize`** | Kein `innerHTML`, also XSS-sicher by construction; `components`-Mapping erlaubt Fenster-öffnende `nostr:`-Links (§6.1). |
| App-Umfang v1 | **Sieben Apps**: Feed, Profil, Notizen, Einstellungen, Über, Relay-Monitor, Artikel | Relay-Monitor und Artikel sind aus „später" nach v1 gezogen (§6). |

## 10. Definition of Done für v1

- [x] Fenster: öffnen, schließen, ziehen, skalieren, minimieren, maximieren, fokussieren — alles flüssig
- [x] Menüleiste zeigt korrekt die fokussierte App und alle offenen Fenster
- [x] Desktop-Icons öffnen Apps per Doppelklick und Tastatur
- [x] Light- und Dark-Mode beide vollständig durchgestaltet
- [x] Mobile-Shell funktioniert bis 360px Breite
- [x] Deep-Links (`/npub1…`, `/note1…`, `?app=`) öffnen das richtige Fenster
- [x] Sitzung überlebt einen Reload
- [x] Vollständige Tastaturbedienung, sichtbare Fokusringe, `prefers-reduced-motion` beachtet
- [x] `npm run test` grün (tsc + eslint + vitest + build)

---

## 11. Was während der Umsetzung dazukam

Diese Punkte standen nicht im ursprünglichen Plan, ergaben sich aber aus der Arbeit
am laufenden System:

- **`setParams` pro Fenster.** Apps können ihre eigenen Parameter ändern (§3.5). Damit
  bleibt die URL auch bei Navigation *innerhalb* einer App korrekt, und die Auswahl
  überlebt den Wechsel zwischen Desktop- und Mobile-Shell.
- **NIP-19-Relay-Hints werden ausgewertet.** Ohne sie scheiterten Deep-Links regelmäßig,
  weil das Event auf einem Relay liegt, das der Leser nicht abonniert hat. `nprofile`,
  `nevent` und `naddr` reichen ihre Hints jetzt bis in die Query durch — und kopierte
  Links bekommen umgekehrt die eigenen Read-Relays als Hint mit.
- **Reader auf schmalen Fenstern.** Die Sidebar verschwand unter 640px und machte die
  Artikelliste unerreichbar. Jetzt wechseln Liste und Artikel sich ab.
- **Fenstertitel werden auf 48 Zeichen gekürzt.** Artikel-Überschriften von Relays sind
  beliebig lang und sprengten Titelleiste, Fenster-Menü und Browser-Tab.
- **Minimierte Fenster.** Das `hidden`-Attribut verliert gegen die `flex`-Utility-Klasse;
  das Ausblenden läuft deshalb über einen Inline-Style.
- **Relay-Anzeige ist neutral statt rot,** wenn nichts verbunden ist. Relays werden erst
  bei Bedarf geöffnet und danach wieder geschlossen — „0 verbunden" ist der Normalzustand,
  kein Fehler.
- **Inter als selbstgehostete Schrift** (`@fontsource-variable/inter`), weil die CSP des
  Projekts `font-src 'self'` vorgibt und Google Fonts damit ausscheidet.
- **Kompakte Variante von `LoginArea`/`AccountSwitcher`,** damit der Login in eine 28px
  hohe Menüleiste passt statt sie zu sprengen.
