import { rngFromSeed } from "@sf-fight-club/engine";

import { SLOT } from "./grid.js";

export type MascotClass = "clerk" | "gale" | "vault" | "daemon" | "courier" | "medic" | "rig" | "chatter";

export const MASCOT_CLASSES = [
  "clerk",
  "gale",
  "vault",
  "daemon",
  "courier",
  "medic",
  "rig",
  "chatter",
] as const satisfies readonly MascotClass[];

export interface MascotClassInfo {
  id: MascotClass;
  label: string;
  categories: readonly string[];
  silhouette: string;
}

/** From docs/09-battle-revamp.md section 2. */
export const MASCOT_CLASS_INFO: Record<MascotClass, MascotClassInfo> = {
  clerk: {
    id: "clerk",
    label: "Clerk",
    categories: ["proptech", "civic", "govtech", "legal"],
    silhouette: "Tall figure with a visor and an oversized rubber stamp",
  },
  gale: {
    id: "gale",
    label: "Gale",
    categories: ["climate", "energy", "weather"],
    silhouette: "Bird-like body with turbine wings",
  },
  vault: {
    id: "vault",
    label: "Vault",
    categories: ["fintech", "payments", "insurance"],
    silhouette: "Squat safe on legs with a dial for an eye",
  },
  daemon: {
    id: "daemon",
    label: "Daemon",
    categories: ["devtools", "infra", "ai", "security"],
    silhouette: "Small imp with a terminal for a head",
  },
  courier: {
    id: "courier",
    label: "Courier",
    categories: ["marketplace", "logistics", "commerce"],
    silhouette: "Lean runner with a crate backpack",
  },
  medic: {
    id: "medic",
    label: "Medic",
    categories: ["health", "bio", "wellness"],
    silhouette: "Rounded body with a cross antenna and scanner arm",
  },
  rig: {
    id: "rig",
    label: "Rig",
    categories: ["hardware", "robotics", "mobility"],
    silhouette: "Wide tracked machine with a crane arm",
  },
  chatter: {
    id: "chatter",
    label: "Chatter",
    categories: ["consumer", "social", "media", "education"],
    silhouette: "Speech-bubble head on a small body with antennae",
  },
};

const CATEGORY_CLASS: ReadonlyMap<string, MascotClass> = new Map(
  MASCOT_CLASSES.flatMap((id) => MASCOT_CLASS_INFO[id].categories.map((category) => [category, id] as const)),
);

/** Unknown categories hash to a stable class, per contract. */
export function classForCategory(category: string): MascotClass {
  const normalized = category.trim().toLowerCase();
  const known = CATEGORY_CLASS.get(normalized);
  if (known) return known;
  const roll = rngFromSeed(`class:${normalized}`)();
  return MASCOT_CLASSES[Math.floor(roll * MASCOT_CLASSES.length)] ?? "clerk";
}

export type Corner = "left" | "right";

export const CORNERS: readonly Corner[] = ["left", "right"];

export interface CornerPalette {
  color: string;
  light: string;
  dark: string;
}

export const CORNER_PALETTE: Record<Corner, CornerPalette> = {
  left: { color: "#FA500F", light: "#FF8A4C", dark: "#A32D05" },
  right: { color: "#0082E6", light: "#55B3FB", dark: "#044298" },
};

export interface AccentPalette {
  name: string;
  accent: string;
  accentLight: string;
}

export const ACCENTS: readonly AccentPalette[] = [
  { name: "ember", accent: "#FA500F", accentLight: "#FF9A66" },
  { name: "gold", accent: "#FFAF01", accentLight: "#FFDD73" },
  { name: "jade", accent: "#44BA82", accentLight: "#94EACC" },
  { name: "lagoon", accent: "#12A8B8", accentLight: "#6FE0E8" },
  { name: "violet", accent: "#8A6EF0", accentLight: "#C3B4FF" },
  { name: "rose", accent: "#E64C86", accentLight: "#FF9EC2" },
  { name: "cobalt", accent: "#3F7BE8", accentLight: "#8FB8FF" },
  { name: "lime", accent: "#9BBB3A", accentLight: "#D4E889" },
];

export interface MascotPalette {
  ink: string;
  body: string;
  bodyShade: string;
  bodyLight: string;
  accent: string;
  accentLight: string;
  metal: string;
  metalLight: string;
  eye: string;
  white: string;
}

interface Material {
  body: string;
  bodyShade: string;
  bodyLight: string;
  metal: string;
  metalLight: string;
}

/**
 * Each class has a material that keeps it recognisable even when the accent
 * hue changes. The accent always does the identity work, the material does the
 * silhouette work.
 */
const CLASS_MATERIALS: Record<MascotClass, Material> = {
  clerk: { body: "#E7E1CE", bodyShade: "#C4BDA7", bodyLight: "#FAFAF4", metal: "#56566C", metalLight: "#B8B8CC" },
  gale: { body: "#2F6F6B", bodyShade: "#1C4A47", bodyLight: "#63A9A1", metal: "#8B8FA3", metalLight: "#D2D5DF" },
  vault: { body: "#8A8FA3", bodyShade: "#56566C", bodyLight: "#CACDD9", metal: "#3A3A4C", metalLight: "#E4E4EE" },
  daemon: { body: "#443463", bodyShade: "#2A1F3F", bodyLight: "#7A65A8", metal: "#242433", metalLight: "#8A8AA4" },
  courier: { body: "#6B6A3E", bodyShade: "#484727", bodyLight: "#9C9A62", metal: "#56566C", metalLight: "#B8B8CC" },
  medic: { body: "#E8E4D8", bodyShade: "#C2BDAB", bodyLight: "#FAFAF4", metal: "#8B8879", metalLight: "#DCD9C9" },
  rig: { body: "#C98A22", bodyShade: "#8C5B10", bodyLight: "#F2BC55", metal: "#4A4A5C", metalLight: "#9A9AB0" },
  chatter: { body: "#E6DFCC", bodyShade: "#C0B8A2", bodyLight: "#FAFAF4", metal: "#56566C", metalLight: "#B8B8CC" },
};

export function paletteFor(classId: MascotClass, accent: AccentPalette): MascotPalette {
  const material = CLASS_MATERIALS[classId];
  return {
    ink: "#151524",
    body: material.body,
    bodyShade: material.bodyShade,
    bodyLight: material.bodyLight,
    accent: accent.accent,
    accentLight: accent.accentLight,
    metal: material.metal,
    metalLight: material.metalLight,
    eye: "#FAFAF4",
    white: "#FAFAF4",
  };
}

/** Slot numbers line up with grid.SLOT; index 0 is transparent. */
export const SLOT_COLORS: readonly (keyof MascotPalette | null)[] = [
  null,
  "ink",
  "body",
  "bodyShade",
  "bodyLight",
  "accent",
  "accentLight",
  "metal",
  "metalLight",
  "eye",
  "white",
  "ink",
];

export function colorForSlot(palette: MascotPalette, slot: number, corner: Corner): string {
  if (slot === SLOT.trim) return CORNER_PALETTE[corner].color;
  const key = SLOT_COLORS[slot];
  if (!key) return "transparent";
  return palette[key];
}
