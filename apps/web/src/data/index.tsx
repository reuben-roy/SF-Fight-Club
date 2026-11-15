/**
 * Tournament store provider. Owns the reducer, persists it to localStorage,
 * and hands state + dispatch to the route entries.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactElement,
  type ReactNode,
} from "react";

import { DEMO_BUNDLE } from "./generated/demo.js";
import {
  clearPersistedState,
  initialAppState,
  loadPersistedState,
  reduceAppState,
  resetRequested,
  savePersistedState,
  type AppAction,
  type AppState,
} from "./store.js";

export { DEMO_BUNDLE };

export interface AppStore {
  bundle: typeof DEMO_BUNDLE;
  state: AppState;
  dispatch: (action: AppAction) => void;
}

const AppStoreContext = createContext<AppStore | null>(null);

function initState(): AppState {
  if (typeof window !== "undefined" && resetRequested(window.location.search)) {
    clearPersistedState();
    const fresh = initialAppState(DEMO_BUNDLE);
    savePersistedState(fresh);
    return fresh;
  }
  return loadPersistedState(DEMO_BUNDLE) ?? initialAppState(DEMO_BUNDLE);
}

export function AppStoreProvider({ children }: { children: ReactNode }): ReactElement {
  const [state, baseDispatch] = useReducer(
    (current: AppState, action: AppAction) => reduceAppState(current, action, DEMO_BUNDLE),
    undefined,
    initState,
  );

  useEffect(() => {
    savePersistedState(state);
  }, [state]);

  const value = useMemo<AppStore>(
    () => ({ bundle: DEMO_BUNDLE, state, dispatch: baseDispatch }),
    [state],
  );
  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): AppStore {
  const value = useContext(AppStoreContext);
  if (!value) throw new Error("useAppStore must be used inside AppStoreProvider");
  return value;
}
