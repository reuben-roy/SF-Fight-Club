import { Suspense, useEffect, useRef, useState, type ReactElement } from "react";
import { Link, NavLink, Outlet, createBrowserRouter, useLocation } from "react-router-dom";

import { PlaceholderPage, StripeWipe, classNames } from "../styles/components.js";
import { useAppState } from "../styles/app-state.js";
import { AppStoreProvider } from "../data/index.js";
import { ROUTES } from "../routes.js";

function TopBar(): ReactElement {
  const { muted, setMuted, reducedMotion, setReducedMotion, sound } = useAppState();

  const toggleSound = (): void => {
    const next = !muted;
    setMuted(next);
    sound.setMuted(next);
    if (!next) sound.play("select");
  };

  return (
    <header className="sfc-topbar">
      <Link to="/" className="sfc-brand">
        <span className="sfc-brand__mark" aria-hidden="true" />
        SF FIGHT CLUB
      </Link>
      <nav className="sfc-topbar__nav" aria-label="Main">
        <NavLink to="/tower" className="sfc-navlink">
          Tower
        </NavLink>
        <NavLink to="/dev/art" className="sfc-navlink">
          Art lab
        </NavLink>
        <NavLink to="/dev/cards" className="sfc-navlink">
          Cards
        </NavLink>
      </nav>
      <div className="sfc-topbar__spacer" />
      <div className="sfc-topbar__toggles">
        <button
          type="button"
          className={classNames("sfc-btn", "sfc-btn--sm")}
          aria-pressed={!muted}
          onClick={toggleSound}
        >
          {muted ? "Sound off" : "Sound on"}
        </button>
        <button
          type="button"
          className={classNames("sfc-btn", "sfc-btn--sm")}
          aria-pressed={reducedMotion}
          onClick={() => setReducedMotion(!reducedMotion)}
        >
          Reduced motion {reducedMotion ? "on" : "off"}
        </button>
      </div>
    </header>
  );
}

function Shell(): ReactElement {
  const location = useLocation();
  const [wipe, setWipe] = useState(false);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setWipe(true);
    const id = window.setTimeout(() => setWipe(false), 980);
    return () => window.clearTimeout(id);
  }, [location.pathname]);

  return (
    <div className="sfc-shell">
      <TopBar />
      <main id="main">
        <Suspense fallback={<PlaceholderPage kicker="Loading" title="SF FIGHT CLUB" />}>
          <AppStoreProvider>
            <Outlet />
          </AppStoreProvider>
        </Suspense>
      </main>
      <footer className="sfc-footer">
        Built at the Mistral AI hackathon / Fictional demo data / Play money only, no cash value
      </footer>
      <StripeWipe active={wipe} />
    </div>
  );
}

function NotFound(): ReactElement {
  return <PlaceholderPage kicker="404" title="NO SUCH FLOOR" body="That route is not on the card. Go back to the Tower." />;
}

const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      ...ROUTES.map((route) => ({
        path: route.path,
        element: <route.Component />,
      })),
      { path: "*", element: <NotFound /> },
    ],
  },
]);

export { router };
