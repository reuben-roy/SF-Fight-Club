import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

import { createSoundKit, type SoundKit } from "../art/sound.js";

export interface AppState {
  reducedMotion: boolean;
  setReducedMotion: (value: boolean) => void;
  muted: boolean;
  setMuted: (value: boolean) => void;
  sound: SoundKit;
}

const AppStateContext = createContext<AppState | null>(null);

const REDUCED_KEY = "sfc.reduced-motion";
const MUTED_KEY = "sfc.muted";

function readFlag(key: string): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? null : value === "true";
  } catch {
    return null;
  }
}

function writeFlag(key: string, value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Private mode can refuse storage. The preference still applies this session.
  }
}

function systemReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function AppProviders({ children }: { children: ReactNode }): ReactElement {
  const [reducedMotion, setReducedMotionState] = useState<boolean>(() => readFlag(REDUCED_KEY) ?? systemReducedMotion());
  const [muted, setMutedState] = useState<boolean>(() => readFlag(MUTED_KEY) ?? true);
  const sound = useMemo(() => createSoundKit(), []);

  const setReducedMotion = useCallback((value: boolean) => {
    setReducedMotionState(value);
    writeFlag(REDUCED_KEY, value);
  }, []);

  const setMuted = useCallback((value: boolean) => {
    setMutedState(value);
    writeFlag(MUTED_KEY, value);
  }, []);

  useEffect(() => {
    sound.setMuted(muted);
  }, [muted, sound]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.reducedMotion = String(reducedMotion);
    return () => {
      delete root.dataset.reducedMotion;
    };
  }, [reducedMotion]);

  useEffect(() => {
    if (readFlag(REDUCED_KEY) !== null) return;
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (event: MediaQueryListEvent): void => setReducedMotionState(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => () => sound.dispose(), [sound]);

  const value = useMemo(
    () => ({ reducedMotion, setReducedMotion, muted, setMuted, sound }),
    [reducedMotion, setReducedMotion, muted, setMuted, sound],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppState {
  const value = useContext(AppStateContext);
  if (!value) throw new Error("useAppState must be used inside AppProviders");
  return value;
}

export function useReducedMotion(): boolean {
  const value = useContext(AppStateContext);
  const [media, setMedia] = useState<boolean>(() => systemReducedMotion());
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (event: MediaQueryListEvent): void => setMedia(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return value ? value.reducedMotion : media;
}
