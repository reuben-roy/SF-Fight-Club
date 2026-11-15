import * as z from "zod";

export const orgTitleSchema = z.enum(["Intern", "Associate", "Manager", "Director", "VP", "President", "CEO"]);
export type OrgTitle = z.infer<typeof orgTitleSchema>;

export interface OrgNode {
  entrantId: string;
  seed: number;
  title: OrgTitle;
  wins: number;
  headcount: number;
  alive: boolean;
  defeatedBy: string | null;
  defeatedInRound: number | null;
  via: "FIGHT" | "WALKOVER" | null;
  reports: OrgNode[];
}

export const orgNodeSchema: z.ZodType<OrgNode> = z.strictObject({
  entrantId: z.string().min(1),
  seed: z.number(),
  title: orgTitleSchema,
  wins: z.number().int().nonnegative(),
  headcount: z.number().int().positive(),
  alive: z.boolean(),
  defeatedBy: z.string().min(1).nullable(),
  defeatedInRound: z.number().int().nonnegative().nullable(),
  via: z.enum(["FIGHT", "WALKOVER"]).nullable(),
  get reports() {
    return z.array(orgNodeSchema);
  },
});

export const orgChartSchema = z.strictObject({
  rounds: z.number().int().nonnegative(),
  roots: z.array(orgNodeSchema),
  championId: z.string().min(1).nullable(),
});
export type OrgChart = z.infer<typeof orgChartSchema>;
