import { SLOT, ellipse, line, put, rect, type PixelGrid } from "./grid.js";
import type { MascotClass } from "./palette.js";

/**
 * Pose is deliberately small. A few pixels of lean, bob and arm travel reads as
 * motion at 48x48 and keeps every frame inside the grid.
 */
export interface MascotPose {
  lean: number;
  bob: number;
  reach: number;
  raise: number;
  hop: number;
  blink: boolean;
}

export interface MascotBody {
  variant: number;
  eyeStyle: number;
  accessory: number;
}

function basePlate(g: PixelGrid, x0: number, x1: number): void {
  rect(g, x0, 45, x1 - x0, 2, SLOT.trim);
  rect(g, x0, 45, x1 - x0, 1, SLOT.accentLight);
}

function drawEye(g: PixelGrid, x: number, y: number, style: number, blink: boolean): void {
  if (blink) {
    rect(g, x - 1, y + 1, 4, 1, SLOT.bodyShade);
    return;
  }
  switch (style % 4) {
    case 0:
      rect(g, x, y, 2, 2, SLOT.eye);
      break;
    case 1:
      rect(g, x - 1, y, 4, 2, SLOT.eye);
      put(g, x, y, SLOT.accent);
      break;
    case 2:
      put(g, x - 1, y, SLOT.eye);
      put(g, x + 1, y, SLOT.eye);
      put(g, x, y + 1, SLOT.accent);
      put(g, x - 1, y + 2, SLOT.eye);
      put(g, x + 1, y + 2, SLOT.eye);
      break;
    default:
      rect(g, x - 1, y, 4, 1, SLOT.eye);
      rect(g, x - 1, y + 2, 4, 1, SLOT.eye);
      put(g, x - 1, y + 1, SLOT.eye);
      put(g, x + 2, y + 1, SLOT.eye);
      break;
  }
}

function accessoryMark(g: PixelGrid, classId: MascotClass, body: MascotBody, ox: number, oy: number): void {
  const slot = [SLOT.accent, SLOT.accentLight, SLOT.trim, SLOT.metalLight][body.accessory % 4] ?? SLOT.accent;
  switch (classId) {
    case "clerk":
      rect(g, 26 + ox, 20 + oy, 2, 3, slot);
      break;
    case "gale":
      rect(g, 7 + ox, 30 + oy, 5, 2, slot);
      break;
    case "vault":
      rect(g, 33 + ox, 15 + oy, 3, 3, slot);
      break;
    case "daemon":
      rect(g, 38 + ox, 5 + oy, 3, 3, slot);
      put(g, 39 + ox, 4 + oy, slot);
      break;
    case "courier":
      rect(g, 24 + ox, 20 + oy, 3, 2, slot);
      break;
    case "medic":
      rect(g, 29 + ox, 32 + oy, 4, 3, slot);
      break;
    case "rig":
      rect(g, 29 + ox, 16 + oy, 4, 2, slot);
      break;
    case "chatter":
      rect(g, 38 + ox, 6 + oy, 3, 2, slot);
      put(g, 39 + ox, 9 + oy, slot);
      break;
  }
}

function drawClerk(g: PixelGrid, body: MascotBody, pose: MascotPose): void {
  const ox = pose.lean;
  const oy = pose.bob + pose.hop;
  const reach = pose.reach;
  const raise = pose.raise;
  basePlate(g, 16, 32);

  rect(g, 19, 32 + pose.hop, 4, 11, SLOT.bodyShade);
  rect(g, 25, 32 + pose.hop, 4, 11, SLOT.body);
  rect(g, 22, 32 + pose.hop, 1, 9, SLOT.bodyShade);
  rect(g, 17, 42 + pose.hop, 7, 3, SLOT.metal);
  rect(g, 24, 42 + pose.hop, 8, 3, SLOT.metal);
  rect(g, 30, 43 + pose.hop, 2, 1, SLOT.metalLight);

  rect(g, 18 + ox, 15 + oy, 12, 18, SLOT.body);
  rect(g, 18 + ox, 15 + oy, 12, 2, SLOT.trim);
  rect(g, 18 + ox, 31 + oy, 12, 2, SLOT.bodyShade);
  rect(g, 27 + ox, 17 + oy, 3, 14, SLOT.bodyShade);
  rect(g, 23 + ox, 18 + oy, 2, 7, SLOT.accent);
  put(g, 23 + ox, 27 + oy, SLOT.accentLight);
  put(g, 23 + ox, 30 + oy, SLOT.accentLight);

  rect(g, 20 + ox, 8 + oy, 8, 8, SLOT.body);
  rect(g, 20 + ox, 8 + oy, 8, 2, SLOT.bodyLight);
  rect(g, 20 + ox, 10 + oy, 8, 2, SLOT.accent);
  put(g, 21 + ox, 10 + oy, SLOT.accentLight);
  put(g, 26 + ox, 10 + oy, SLOT.accentLight);

  if (body.variant === 1) {
    rect(g, 18 + ox, 6 + oy, 12, 2, SLOT.metal);
    rect(g, 20 + ox, 3 + oy, 8, 3, SLOT.metal);
    rect(g, 20 + ox, 3 + oy, 8, 1, SLOT.metalLight);
  } else if (body.variant === 2) {
    rect(g, 19 + ox, 5 + oy, 3, 4, SLOT.metal);
    rect(g, 26 + ox, 5 + oy, 3, 4, SLOT.metal);
    rect(g, 19 + ox, 5 + oy, 3, 1, SLOT.metalLight);
  } else {
    rect(g, 21 + ox, 6 + oy, 6, 2, SLOT.bodyShade);
    rect(g, 21 + ox, 6 + oy, 6, 1, SLOT.body);
  }

  rect(g, 16 + ox, 17 + oy, 2, 9, SLOT.bodyShade);
  rect(g, 15 + ox, 25 + oy, 3, 2, SLOT.body);
  rect(g, 29 + ox, 17 + oy, 4, 3, SLOT.bodyShade);
  rect(g, 31 + ox + reach, 19 + oy - raise, 4, 2, SLOT.metalLight);
  rect(g, 34 + ox + reach, 14 + oy - raise, 3, 7, SLOT.metal);
  rect(g, 34 + ox + reach, 14 + oy - raise, 3, 1, SLOT.metalLight);
  rect(g, 32 + ox + reach, 20 + oy - raise, 11, 8, SLOT.metal);
  rect(g, 32 + ox + reach, 20 + oy - raise, 11, 2, SLOT.metalLight);
  rect(g, 33 + ox + reach, 22 + oy - raise, 9, 3, SLOT.bodyShade);
  rect(g, 32 + ox + reach, 25 + oy - raise, 11, 2, SLOT.accent);
  rect(g, 33 + ox + reach, 25 + oy - raise, 9, 1, SLOT.accentLight);

  accessoryMark(g, "clerk", body, ox, oy);
}

function drawGale(g: PixelGrid, body: MascotBody, pose: MascotPose): void {
  const ox = pose.lean;
  const oy = pose.bob + pose.hop;
  const raise = pose.raise;
  basePlate(g, 16, 32);

  rect(g, 21, 34 + pose.hop, 2, 10, SLOT.metal);
  rect(g, 26, 34 + pose.hop, 2, 10, SLOT.metal);
  rect(g, 19, 43 + pose.hop, 5, 2, SLOT.metalLight);
  rect(g, 25, 43 + pose.hop, 5, 2, SLOT.metalLight);

  line(g, 18 + ox, 30 + oy, 9 + ox, 35 + oy, SLOT.accent, 2);
  line(g, 10 + ox, 35 + oy, 6 + ox, 33 + oy, SLOT.accentLight, 1);

  ellipse(g, 24 + ox, 27 + oy, 8, 10, SLOT.body);
  ellipse(g, 24 + ox, 27 + oy, 5, 7, SLOT.bodyLight);
  rect(g, 19 + ox, 35 + oy, 11, 2, SLOT.bodyShade);

  ellipse(g, 24 + ox, 13 + oy, 7, 6, SLOT.body);
  rect(g, 20 + ox, 8 + oy, 9, 2, SLOT.bodyLight);
  rect(g, 30 + ox, 12 + oy, 5, 3, SLOT.accent);
  rect(g, 30 + ox, 14 + oy, 4, 1, SLOT.accentLight);
  drawEye(g, 27 + ox, 11 + oy, body.eyeStyle, pose.blink);

  if (body.variant === 0) {
    line(g, 20 + ox, 7 + oy, 17 + ox, 2 + oy, SLOT.accent, 1);
    line(g, 24 + ox, 7 + oy, 24 + ox, 1 + oy, SLOT.accent, 1);
    line(g, 28 + ox, 7 + oy, 31 + ox, 2 + oy, SLOT.accent, 1);
  } else if (body.variant === 1) {
    ellipse(g, 24 + ox, 7 + oy, 5, 3, SLOT.accent);
    rect(g, 21 + ox, 4 + oy, 7, 1, SLOT.accentLight);
  } else {
    rect(g, 18 + ox, 6 + oy, 3, 5, SLOT.bodyShade);
    rect(g, 27 + ox, 6 + oy, 3, 5, SLOT.bodyShade);
    rect(g, 20 + ox, 5 + oy, 8, 2, SLOT.metal);
  }

  const wingY = 22 + oy + raise;
  if (body.variant === 0) {
    ellipse(g, 9 + ox, wingY, 6, 4, SLOT.body);
    ellipse(g, 39 + ox, wingY, 6, 4, SLOT.body);
    ellipse(g, 7 + ox, wingY, 3, 3, SLOT.metal);
    ellipse(g, 41 + ox, wingY, 3, 3, SLOT.metal);
    put(g, 7 + ox, wingY, SLOT.accentLight);
    put(g, 41 + ox, wingY, SLOT.accentLight);
    line(g, 13 + ox, wingY - 3, 15 + ox, wingY - 1, SLOT.accent, 1);
    line(g, 33 + ox, wingY - 1, 35 + ox, wingY - 3, SLOT.accent, 1);
  } else if (body.variant === 1) {
    ellipse(g, 12 + ox, wingY - 5, 4, 7, SLOT.body);
    ellipse(g, 36 + ox, wingY - 5, 4, 7, SLOT.body);
    ellipse(g, 10 + ox, wingY - 8, 3, 3, SLOT.metal);
    ellipse(g, 38 + ox, wingY - 8, 3, 3, SLOT.metal);
    put(g, 10 + ox, wingY - 8, SLOT.accentLight);
    put(g, 38 + ox, wingY - 8, SLOT.accentLight);
    line(g, 12 + ox, wingY + 1, 10 + ox, wingY + 5, SLOT.accent, 1);
    line(g, 36 + ox, wingY + 1, 38 + ox, wingY + 5, SLOT.accent, 1);
  } else {
    line(g, 15 + ox, wingY, 3 + ox, wingY + 3, SLOT.body, 3);
    line(g, 33 + ox, wingY, 45 + ox, wingY + 3, SLOT.body, 3);
    ellipse(g, 5 + ox, wingY + 4, 2, 2, SLOT.metal);
    ellipse(g, 43 + ox, wingY + 4, 2, 2, SLOT.metal);
    line(g, 10 + ox, wingY + 4, 6 + ox, wingY + 6, SLOT.accentLight, 1);
    line(g, 38 + ox, wingY + 4, 42 + ox, wingY + 6, SLOT.accentLight, 1);
  }

  accessoryMark(g, "gale", body, ox, oy);
}

function drawVault(g: PixelGrid, body: MascotBody, pose: MascotPose): void {
  const ox = pose.lean;
  const oy = pose.bob + pose.hop;
  basePlate(g, 7, 41);

  rect(g, 11, 35 + pose.hop, 7, 9, SLOT.metal);
  rect(g, 30, 35 + pose.hop, 7, 9, SLOT.metal);
  rect(g, 9, 43 + pose.hop, 10, 2, SLOT.metalLight);
  rect(g, 29, 43 + pose.hop, 10, 2, SLOT.metalLight);

  const width = body.variant === 2 ? 34 : body.variant === 1 ? 28 : 32;
  const x0 = 24 - Math.floor(width / 2);
  rect(g, x0 + ox, 13 + oy, width, 22, SLOT.metal);
  if (body.variant === 1) {
    ellipse(g, 24 + ox, 14 + oy, 14, 4, SLOT.metal);
    rect(g, 10 + ox, 14 + oy, 28, 3, SLOT.metal);
  }
  rect(g, x0 + ox, 13 + oy, width, 2, SLOT.metalLight);
  rect(g, x0 + ox, 32 + oy, width, 3, SLOT.bodyShade);
  rect(g, x0 + width - 3 + ox, 16 + oy, 3, 17, SLOT.bodyShade);
  rect(g, x0 + 2 + ox, 17 + oy, width - 5, 14, SLOT.body);
  rect(g, x0 + 2 + ox, 17 + oy, width - 5, 1, SLOT.metalLight);

  ellipse(g, 24 + ox, 24 + oy, 6, 6, SLOT.metalLight);
  ellipse(g, 24 + ox, 24 + oy, 4, 4, SLOT.bodyShade);
  ellipse(g, 24 + ox, 24 + oy, 2, 2, SLOT.accent);
  put(g, 24 + ox, 24 + oy, SLOT.eye);
  put(g, 24 + ox, 18 + oy, SLOT.accentLight);
  put(g, 24 + ox, 30 + oy, SLOT.accentLight);
  put(g, 18 + ox, 24 + oy, SLOT.accentLight);
  put(g, 30 + ox, 24 + oy, SLOT.accentLight);

  rect(g, x0 + width - 7 + ox, 21 + oy, 3, 8, SLOT.trim);
  rect(g, x0 + width - 8 + ox, 21 + oy, 5, 1, SLOT.trim);
  rect(g, x0 + 1 + ox, 15 + oy, 2, 2, SLOT.accentLight);
  rect(g, x0 + width - 3 + ox, 15 + oy, 2, 2, SLOT.accentLight);
  rect(g, x0 + 1 + ox, 30 + oy, 2, 2, SLOT.accentLight);
  rect(g, x0 + width - 3 + ox, 30 + oy, 2, 2, SLOT.accentLight);

  rect(g, x0 - 3 + ox, 22 + oy, 3, 8, SLOT.metal);
  rect(g, x0 + width + ox, 22 + oy, 3, 8, SLOT.metal);
  rect(g, x0 - 3 + ox, 22 + oy, 3, 2, SLOT.metalLight);
  rect(g, x0 + width + ox, 22 + oy, 3, 2, SLOT.metalLight);

  if (body.variant === 2) {
    rect(g, x0 + 5 + ox, 9 + oy, 16, 4, SLOT.metal);
    rect(g, x0 + 7 + ox, 7 + oy, 12, 2, SLOT.metalLight);
  } else {
    rect(g, 17 + ox, 10 + oy, 14, 3, SLOT.bodyShade);
    rect(g, 18 + ox, 10 + oy, 12, 1, SLOT.metalLight);
  }

  accessoryMark(g, "vault", body, ox, oy);
}

function drawDaemon(g: PixelGrid, body: MascotBody, pose: MascotPose): void {
  const ox = pose.lean;
  const oy = pose.bob + pose.hop;
  basePlate(g, 15, 33);

  rect(g, 19, 34 + pose.hop, 4, 9, SLOT.bodyShade);
  rect(g, 25, 34 + pose.hop, 4, 9, SLOT.bodyShade);
  rect(g, 17, 43 + pose.hop, 7, 2, SLOT.metal);
  rect(g, 24, 43 + pose.hop, 7, 2, SLOT.metal);

  rect(g, 18 + ox, 24 + oy, 12, 11, SLOT.body);
  rect(g, 18 + ox, 24 + oy, 12, 2, SLOT.bodyLight);
  rect(g, 21 + ox, 28 + oy, 6, 5, SLOT.accent);
  rect(g, 22 + ox, 29 + oy, 4, 3, SLOT.accentLight);

  rect(g, 12 + ox, 9 + oy, 24, 15, SLOT.metal);
  rect(g, 12 + ox, 9 + oy, 24, 2, SLOT.trim);
  rect(g, 14 + ox, 12 + oy, 20, 9, SLOT.ink);
  rect(g, 16 + ox, 14 + oy, 4, 2, SLOT.accentLight);
  rect(g, 21 + ox, 14 + oy, 3, 2, SLOT.accentLight);
  rect(g, 16 + ox, 17 + oy, 3, 1, SLOT.accent);
  rect(g, 20 + ox, 17 + oy, 7, 1, SLOT.accent);
  rect(g, 12 + ox, 21 + oy, 2, 3, SLOT.metalLight);
  rect(g, 34 + ox, 21 + oy, 2, 3, SLOT.metalLight);

  if (body.variant === 0) {
    line(g, 14 + ox, 9 + oy, 11 + ox, 4 + oy, SLOT.accent, 2);
    line(g, 34 + ox, 9 + oy, 37 + ox, 4 + oy, SLOT.accent, 2);
    line(g, 11 + ox, 4 + oy, 13 + ox, 2 + oy, SLOT.accentLight, 1);
    line(g, 37 + ox, 4 + oy, 35 + ox, 2 + oy, SLOT.accentLight, 1);
  } else if (body.variant === 1) {
    line(g, 24 + ox, 9 + oy, 24 + ox, 3 + oy, SLOT.metal, 1);
    rect(g, 22 + ox, 1 + oy, 5, 3, SLOT.accent);
    put(g, 24 + ox, 2 + oy, SLOT.accentLight);
  } else {
    ellipse(g, 11 + ox, 10 + oy, 3, 5, SLOT.body);
    ellipse(g, 37 + ox, 10 + oy, 3, 5, SLOT.body);
    put(g, 11 + ox, 10 + oy, SLOT.accentLight);
    put(g, 37 + ox, 10 + oy, SLOT.accentLight);
  }

  rect(g, 16 + ox, 25 + oy, 3, 8, SLOT.body);
  rect(g, 29 + ox, 25 + oy, 3, 8 + Math.max(0, pose.reach), SLOT.body);
  rect(g, 15 + ox, 32 + oy, 4, 2, SLOT.accent);
  rect(g, 29 + ox, 32 + oy + Math.max(0, pose.reach), 4, 2, SLOT.accent);

  line(g, 30 + ox, 33 + oy, 36 + ox, 31 + oy, SLOT.accent, 1);
  line(g, 36 + ox, 31 + oy, 38 + ox, 27 + oy, SLOT.accent, 1);
  put(g, 38 + ox, 26 + oy, SLOT.accentLight);

  accessoryMark(g, "daemon", body, ox, oy);
}

function drawCourier(g: PixelGrid, body: MascotBody, pose: MascotPose): void {
  const ox = pose.lean;
  const oy = pose.bob + pose.hop;
  basePlate(g, 14, 35);

  line(g, 24, 32 + pose.hop, 31, 44 + pose.hop, SLOT.bodyShade, 3);
  line(g, 22, 32 + pose.hop, 18, 44 + pose.hop, SLOT.body, 3);
  rect(g, 27, 43 + pose.hop, 7, 2, SLOT.metal);
  rect(g, 15, 43 + pose.hop, 6, 2, SLOT.metal);

  rect(g, 21 + ox, 25 + oy, 7, 8, SLOT.body);
  rect(g, 23 + ox, 20 + oy, 7, 6, SLOT.body);
  rect(g, 25 + ox, 16 + oy, 6, 5, SLOT.body);
  rect(g, 27 + ox, 20 + oy, 3, 12, SLOT.bodyShade);
  rect(g, 21 + ox, 30 + oy, 7, 2, SLOT.accent);

  rect(g, 26 + ox, 9 + oy, 8, 8, SLOT.body);
  rect(g, 26 + ox, 9 + oy, 8, 2, SLOT.bodyLight);
  rect(g, 24 + ox, 7 + oy, 11, 2, SLOT.trim);
  rect(g, 32 + ox, 9 + oy, 5, 2, SLOT.trim);
  rect(g, 34 + ox, 9 + oy, 3, 1, SLOT.trim);
  drawEye(g, 31 + ox, 12 + oy, body.eyeStyle, pose.blink);
  rect(g, 27 + ox, 15 + oy, 5, 1, SLOT.bodyShade);

  const crateX = body.variant === 2 ? 11 : 7;
  const crateW = body.variant === 2 ? 9 : 12;
  const crateH = body.variant === 1 ? 11 : 14;
  rect(g, crateX, 18 + oy, crateW, crateH, SLOT.metal);
  rect(g, crateX, 18 + oy, crateW, 2, SLOT.metalLight);
  rect(g, crateX, 18 + oy + crateH - 2, crateW, 2, SLOT.bodyShade);
  rect(g, crateX + 2, 21 + oy, crateW - 4, 2, SLOT.accent);
  rect(g, crateX + 2, 26 + oy, crateW - 4, 1, SLOT.accentLight);
  if (body.variant === 1) {
    rect(g, crateX + 2, 30 + oy, crateW - 4, 2, SLOT.accent);
  }

  line(g, 27 + ox, 23 + oy, 35 + ox + pose.reach, 26 + oy - pose.raise, SLOT.bodyShade, 2);
  rect(g, 34 + ox + pose.reach, 25 + oy - pose.raise, 3, 3, SLOT.accent);
  line(g, 22 + ox, 23 + oy, 16 + ox, 26 + oy, SLOT.bodyShade, 2);
  rect(g, 14 + ox, 25 + oy, 3, 2, SLOT.body);

  line(g, 24 + ox, 16 + oy, 18 + ox, 13 + oy, SLOT.accent, 2);
  put(g, 17 + ox, 12 + oy, SLOT.accentLight);

  accessoryMark(g, "courier", body, ox, oy);
}

function drawMedic(g: PixelGrid, body: MascotBody, pose: MascotPose): void {
  const ox = pose.lean;
  const oy = pose.bob + pose.hop;
  basePlate(g, 15, 33);

  rect(g, 19, 38 + pose.hop, 4, 7, SLOT.metal);
  rect(g, 25, 38 + pose.hop, 4, 7, SLOT.metal);
  rect(g, 18, 43 + pose.hop, 6, 2, SLOT.metalLight);
  rect(g, 25, 43 + pose.hop, 6, 2, SLOT.metalLight);

  ellipse(g, 24 + ox, 29 + oy, 11, 11, SLOT.body);
  ellipse(g, 24 + ox, 30 + oy, 8, 8, SLOT.bodyLight);
  rect(g, 20 + ox, 38 + oy, 9, 1, SLOT.bodyShade);
  rect(g, 22 + ox, 25 + oy, 5, 2, SLOT.accent);
  rect(g, 23 + ox, 23 + oy, 3, 6, SLOT.accent);

  rect(g, 22 + ox, 25 + oy, 5, 2, SLOT.accent);
  rect(g, 23 + ox, 23 + oy, 3, 6, SLOT.accent);
  ellipse(g, 24 + ox, 14 + oy, 6, 5, SLOT.body);
  rect(g, 20 + ox, 10 + oy, 9, 2, SLOT.bodyLight);
  rect(g, 20 + ox, 13 + oy, 9, 2, SLOT.accent);
  put(g, 22 + ox, 13 + oy, SLOT.accentLight);
  put(g, 26 + ox, 13 + oy, SLOT.accentLight);

  line(g, 24 + ox, 9 + oy, 24 + ox, 2 + oy, SLOT.metal, 1);
  rect(g, 20 + ox, 4 + oy, 9, 2, SLOT.accent);
  rect(g, 23 + ox, 1 + oy, 3, 8, SLOT.accent);
  put(g, 24 + ox, 2 + oy, SLOT.accentLight);

  rect(g, 10 + ox, 25 + oy, 4, 4, SLOT.bodyShade);
  rect(g, 9 + ox, 24 + oy, 3, 3, SLOT.body);
  rect(g, 34 + ox, 25 + oy, 5 + pose.reach, 3, SLOT.metal);
  rect(g, 38 + ox + pose.reach, 20 + oy - pose.raise, 5, 11, SLOT.metalLight);
  rect(g, 40 + ox + pose.reach, 22 + oy - pose.raise, 3, 3, SLOT.accent);
  rect(g, 40 + ox + pose.reach, 27 + oy - pose.raise, 3, 2, SLOT.bodyShade);

  if (body.variant === 1) {
    ellipse(g, 11 + ox, 29 + oy, 4, 7, SLOT.metal);
    rect(g, 10 + ox, 22 + oy, 3, 3, SLOT.metalLight);
  } else if (body.variant === 2) {
    rect(g, 14 + ox, 32 + oy, 20, 3, SLOT.trim);
  }
  accessoryMark(g, "medic", body, ox, oy);
}

function drawRig(g: PixelGrid, body: MascotBody, pose: MascotPose): void {
  const ox = pose.lean;
  const oy = pose.bob + pose.hop;
  basePlate(g, 4, 44);

  rect(g, 5, 36 + pose.hop, 38, 9, SLOT.metal);
  rect(g, 5, 36 + pose.hop, 38, 2, SLOT.metalLight);
  rect(g, 5, 43 + pose.hop, 38, 2, SLOT.bodyShade);
  for (const wheel of [11, 24, 37]) {
    ellipse(g, wheel, 40 + pose.hop, 3, 3, SLOT.bodyShade);
    put(g, wheel, 40 + pose.hop, SLOT.accentLight);
  }
  for (let x = 7; x < 43; x += 6) {
    rect(g, x, 38 + pose.hop, 2, 1, SLOT.accent);
  }

  rect(g, 12 + ox, 27 + oy, 25, 10, SLOT.body);
  rect(g, 12 + ox, 27 + oy, 25, 2, SLOT.bodyLight);
  rect(g, 12 + ox, 35 + oy, 25, 2, SLOT.bodyShade);
  rect(g, 31 + ox, 29 + oy, 6, 6, SLOT.bodyShade);

  rect(g, 26 + ox, 17 + oy, 12, 10, SLOT.body);
  rect(g, 26 + ox, 17 + oy, 12, 2, SLOT.trim);
  rect(g, 28 + ox, 20 + oy, 8, 5, SLOT.accent);
  rect(g, 29 + ox, 21 + oy, 6, 3, SLOT.accentLight);
  rect(g, 26 + ox, 15 + oy, 12, 2, SLOT.metal);

  const jointX = 20 + ox;
  const jointY = body.variant === 1 ? 15 : body.variant === 2 ? 10 : 13;
  line(g, jointX, 27 + oy, jointX - 3, jointY - 4 + oy, SLOT.metal, 2);
  line(g, jointX - 3, jointY - 4 + oy, 35 + ox + pose.reach, jointY + oy - pose.raise, SLOT.metal, 2);
  ellipse(g, jointX - 3, jointY - 4 + oy, 2, 2, SLOT.accentLight);
  line(g, 35 + ox + pose.reach, jointY + oy - pose.raise, 35 + ox + pose.reach, 18 + oy - pose.raise, SLOT.metalLight, 1);
  rect(g, 33 + ox + pose.reach, 18 + oy - pose.raise, 5, 2, SLOT.accent);
  rect(g, 34 + ox + pose.reach, 20 + oy - pose.raise, 3, 1, SLOT.accent);

  rect(g, 14 + ox, 19 + oy, 3, 8, SLOT.metal);
  rect(g, 14 + ox, 19 + oy, 3, 2, SLOT.bodyShade);
  rect(g, 9 + ox, 29 + oy, 4, 5, SLOT.bodyShade);
  rect(g, 8 + ox, 33 + oy, 5, 2, SLOT.metal);

  if (body.variant === 2) {
    rect(g, 37 + ox, 22 + oy, 3, 5, SLOT.metal);
    rect(g, 37 + ox, 20 + oy, 3, 2, SLOT.bodyShade);
  }

  accessoryMark(g, "rig", body, ox, oy);
}

function drawChatter(g: PixelGrid, body: MascotBody, pose: MascotPose): void {
  const ox = pose.lean;
  const oy = pose.bob + pose.hop;
  basePlate(g, 16, 33);

  rect(g, 20, 38 + pose.hop, 3, 7, SLOT.metal);
  rect(g, 26, 38 + pose.hop, 3, 7, SLOT.metal);
  rect(g, 19, 43 + pose.hop, 5, 2, SLOT.metalLight);
  rect(g, 26, 43 + pose.hop, 5, 2, SLOT.metalLight);

  rect(g, 20 + ox, 27 + oy, 9, 12, SLOT.body);
  rect(g, 20 + ox, 27 + oy, 9, 2, SLOT.trim);
  rect(g, 22 + ox, 30 + oy, 5, 6, SLOT.accent);
  rect(g, 23 + ox, 31 + oy, 3, 2, SLOT.accentLight);

  if (body.variant === 1) {
    rect(g, 9 + ox, 6 + oy, 31, 20, SLOT.bodyLight);
    rect(g, 9 + ox, 6 + oy, 31, 2, SLOT.body);
    rect(g, 9 + ox, 24 + oy, 31, 2, SLOT.bodyShade);
    rect(g, 9 + ox, 6 + oy, 2, 20, SLOT.body);
    rect(g, 38 + ox, 6 + oy, 2, 20, SLOT.bodyShade);
  } else {
    ellipse(g, 24 + ox, 15 + oy, 15, 10, SLOT.bodyLight);
    ellipse(g, 24 + ox, 15 + oy, 12, 7, SLOT.white);
    rect(g, 10 + ox, 11 + oy, 28, 8, SLOT.bodyLight);
    rect(g, 12 + ox, 13 + oy, 24, 4, SLOT.white);
    rect(g, 12 + ox, 22 + oy, 8, 2, SLOT.bodyShade);
  }

  line(g, 20 + ox, 24 + oy, 18 + ox, 31 + oy, SLOT.bodyLight, 3);
  line(g, 18 + ox, 31 + oy, 27 + ox, 25 + oy, SLOT.bodyLight, 3);

  drawEye(g, 19 + ox, 13 + oy, body.eyeStyle === 3 ? 0 : body.eyeStyle, pose.blink);
  drawEye(g, 28 + ox, 13 + oy, body.eyeStyle === 3 ? 0 : body.eyeStyle, pose.blink);
  rect(g, 21 + ox, 19 + oy, 6, 1, SLOT.bodyShade);
  put(g, 20 + ox, 18 + oy, SLOT.bodyShade);
  put(g, 27 + ox, 18 + oy, SLOT.bodyShade);

  if (body.variant === 2) {
    rect(g, 15 + ox, 5 + oy, 3, 4, SLOT.accent);
    rect(g, 14 + ox, 4 + oy, 5, 1, SLOT.accentLight);
    rect(g, 30 + ox, 5 + oy, 3, 4, SLOT.accent);
    rect(g, 29 + ox, 4 + oy, 5, 1, SLOT.accentLight);
  } else {
    line(g, 18 + ox, 6 + oy, 15 + ox, 1 + oy, SLOT.metal, 1);
    line(g, 30 + ox, 6 + oy, 33 + ox, 1 + oy, SLOT.metal, 1);
    rect(g, 13 + ox, 0 + oy, 3, 3, SLOT.accent);
    rect(g, 32 + ox, 0 + oy, 3, 3, SLOT.accent);
    put(g, 14 + ox, 1 + oy, SLOT.accentLight);
    put(g, 33 + ox, 1 + oy, SLOT.accentLight);
  }

  rect(g, 16 + ox, 29 + oy, 4, 3, SLOT.bodyShade);
  rect(g, 29 + ox + Math.min(2, pose.reach), 29 + oy - Math.max(0, pose.raise), 4, 3, SLOT.body);
  rect(g, 32 + ox + Math.min(2, pose.reach), 28 + oy - Math.max(0, pose.raise), 2, 2, SLOT.accent);

  accessoryMark(g, "chatter", body, ox, oy);
}

export function drawMascotBody(
  grid: PixelGrid,
  classId: MascotClass,
  body: MascotBody,
  pose: MascotPose,
): void {
  switch (classId) {
    case "clerk":
      drawClerk(grid, body, pose);
      break;
    case "gale":
      drawGale(grid, body, pose);
      break;
    case "vault":
      drawVault(grid, body, pose);
      break;
    case "daemon":
      drawDaemon(grid, body, pose);
      break;
    case "courier":
      drawCourier(grid, body, pose);
      break;
    case "medic":
      drawMedic(grid, body, pose);
      break;
    case "rig":
      drawRig(grid, body, pose);
      break;
    case "chatter":
      drawChatter(grid, body, pose);
      break;
    default: {
      const exhaustive: never = classId;
      throw new Error(`Unhandled mascot class: ${String(exhaustive)}`);
    }
  }
}
