import * as z from "zod";

import { criterionIdSchema } from "./common.js";
import { shotTypeSchema } from "./volley.js";

export const moveElementSchema = z.enum(["market", "moat", "execution"]);
export type MoveElement = z.infer<typeof moveElementSchema>;

export const moveSchema = z.strictObject({
  name: z.string().min(1),
  element: moveElementSchema,
  criterion: criterionIdSchema,
  type: shotTypeSchema,
});
export type Move = z.infer<typeof moveSchema>;

export const fighterStatusSchema = z.enum(["momentum", "exposed", "last_stand"]);
export type FighterStatus = z.infer<typeof fighterStatusSchema>;
