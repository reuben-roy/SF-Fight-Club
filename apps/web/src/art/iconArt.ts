/**
 * 16x16 pixel icon set from docs/09-battle-revamp.md section 5.
 *
 * Each icon is hand-placed string art so the silhouettes stay readable at 16px.
 * `#` ink, `+` primary, `-` secondary, `o` light, `w` white, `.` transparent.
 */

export const ICON_NAMES = [
  "coin",
  "wall",
  "rocket",
  "shield",
  "gavel",
  "receipt",
  "crown",
  "briefcase",
  "megaphone",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

export type IconInk = "#" | "+" | "-" | "o" | "w" | ".";

export interface IconColors {
  ink: string;
  primary: string;
  secondary: string;
  light: string;
  white: string;
}

export const DEFAULT_ICON_COLORS: IconColors = {
  ink: "#151524",
  primary: "#FFAF01",
  secondary: "#FA500F",
  light: "#FFDD73",
  white: "#FAFAF4",
};

export const ICON_ART: Record<IconName, readonly string[]> = {
  coin: [
    "................",
    ".....######.....",
    "...##++++++##...",
    "..#++oooo++++#..",
    ".#++oo+++++++o#.",
    ".#+oo++####++o#.",
    ".#+o++#+##+#+o#.",
    ".#+o++#+#..#+o#.",
    ".#+o++#+###+#+o#",
    ".#+o++#...#+#+o#",
    ".#+oo++####++o#.",
    ".#++oo+++++++o#.",
    "..#++oooo++++#..",
    "...##++++++##...",
    ".....######.....",
    "................",
  ],
  wall: [
    "................",
    "................",
    ".##.##.##.##.##.",
    ".#+.#+.#+.#+.#+.",
    ".#+.#+.#+.#+.#+.",
    ".##############.",
    ".#++#++#++#++#+.",
    ".#++#++#++#++#+.",
    ".#++#++#++#++#+.",
    ".##############.",
    ".#++#++#++#++#+.",
    ".#++#++#++#++#+.",
    ".#++#++#++#++#+.",
    ".##############.",
    "................",
    "................",
  ],
  rocket: [
    "................",
    "...........####.",
    "..........#++o+#",
    ".........#++o+++",
    "........#++o+++#",
    ".......#++++++#.",
    "......#++++++#..",
    ".....#++++++#...",
    "....#++++++#....",
    "...#++++++#.....",
    "..#++###+#......",
    ".#+#---##.......",
    "..##---#........",
    "...#-#..........",
    "....#...........",
    "................",
  ],
  shield: [
    "................",
    "..############..",
    "..#++++++++++#..",
    "..#++oooo++++#..",
    "..#++o##o++++#..",
    "..#++o#o+++++#..",
    "..#++++o#++++#..",
    "...#++++o#+++#..",
    "...#+++++++++#..",
    "....#+++++++#...",
    ".....#+++++#....",
    "......#+++#.....",
    ".......#+#......",
    "........#.......",
    "................",
    "................",
  ],
  gavel: [
    "................",
    ".......####.....",
    "......#++++#....",
    ".....#++++++#...",
    "....#++++++++#..",
    "...#++++++++++#.",
    "..##############",
    ".....#++++++#...",
    "......#++++#....",
    ".......####.....",
    "................",
    ".....########...",
    ".....#++++++#...",
    ".....#++++++#...",
    ".....########...",
    "................",
  ],
  receipt: [
    "................",
    "...##########...",
    "...#++++++++#...",
    "...#+------+#...",
    "...#++++++++#...",
    "...#+------+#...",
    "...#++++++++#...",
    "...#+------+#...",
    "...#++++++++#...",
    "...#++++++++#...",
    "...#+#+#+#+#+...",
    "...#++++++++#...",
    "....#++#++#+....",
    ".....#+#+#+.....",
    "......###.......",
    "................",
  ],
  crown: [
    "................",
    "................",
    "..#..........#..",
    "..##........##..",
    "..###......###..",
    "..####....####..",
    "..#####..#####..",
    "..############..",
    "..#++++++++++#..",
    "..#++o++++o++#..",
    "..#++++++++++#..",
    "..#+##++++##+#..",
    "..############..",
    "................",
    "................",
    "................",
  ],
  briefcase: [
    "................",
    ".....######.....",
    ".....#....#.....",
    "..############..",
    "..#++++++++++#..",
    "..#++o++++o++#..",
    "..#++++++++++#..",
    "..####----####..",
    "..#++#----#++#..",
    "..#++#----#++#..",
    "..#++++++++++#..",
    "..#++++++++++#..",
    "..#++++++++++#..",
    "..############..",
    "................",
    "................",
  ],
  megaphone: [
    "................",
    "................",
    ".....##.........",
    "....#++#........",
    "...#++++#.......",
    "..#++++++#......",
    ".#++++++++#.....",
    ".#+++++++++##.#.",
    ".#+++++++++##.#.",
    ".#++++++++#.....",
    "..#++++++#......",
    "...#++++#.......",
    "....#++#........",
    ".....##.........",
    "................",
    "................",
  ],
};

const CHAR_KEYS: Readonly<Record<string, keyof IconColors>> = {
  "#": "ink",
  "+": "primary",
  "-": "secondary",
  o: "light",
  w: "white",
};

export interface IconRun {
  x: number;
  y: number;
  width: number;
  color: keyof IconColors;
}

export function iconRuns(name: IconName): IconRun[] {
  const art = ICON_ART[name];
  const runs: IconRun[] = [];
  for (let y = 0; y < art.length; y += 1) {
    const row = art[y] ?? "";
    let start = 0;
    let current = ".";
    for (let x = 0; x <= row.length; x += 1) {
      const char = x < row.length ? row[x] ?? "." : ".";
      if (char !== current) {
        if (current !== "." && x > start) {
          const color = CHAR_KEYS[current];
          if (color) runs.push({ x: start, y, width: x - start, color });
        }
        current = char;
        start = x;
      }
    }
  }
  return runs;
}

export interface DrawIconOptions {
  x: number;
  y: number;
  scale?: number;
  colors?: Partial<IconColors>;
}

export function drawIcon(ctx: CanvasRenderingContext2D, name: IconName, options: DrawIconOptions): void {
  const scale = options.scale ?? 1;
  const colors: IconColors = { ...DEFAULT_ICON_COLORS, ...options.colors };
  for (const run of iconRuns(name)) {
    ctx.fillStyle = colors[run.color];
    ctx.fillRect(options.x + run.x * scale, options.y + run.y * scale, run.width * scale, scale);
  }
}
