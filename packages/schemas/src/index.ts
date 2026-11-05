export {
  CRITERIA_BY_ROUND,
  CRITERION_IDS,
  ROUND_NAME_BY_NUMBER,
  ROUND_NAMES,
  ROUND_OF_CRITERION,
  TIEBREAK_STRATEGIES,
  WEAPON_BY_CRITERION,
  WEAPONS,
  criterionIdSchema,
  decidedBySchema,
  entailmentSchema,
  impactSchema,
  integerScoreSchema,
  isoDateTimeSchema,
  judgeLabelSchema,
  judgeOrderSchema,
  matchStatusSchema,
  outcomeKindSchema,
  roundNameSchema,
  roundNumberSchema,
  roundOrSuddenDeathSchema,
  slotSchema,
  stabilitySchema,
  tiebreakStrategySchema,
  weaponSchema,
} from "./common.js";
export type {
  CriterionId,
  DecidedBy,
  Entailment,
  JudgeLabel,
  JudgeOrder,
  MatchStatus,
  OutcomeKind,
  RoundName,
  RoundNumber,
  Slot,
  Stability,
  TiebreakStrategy,
  Weapon,
} from "./common.js";

export {
  loadVcDefaultRubric,
  loadVcDefaultRubricDocument,
  parseRubric,
  parseRubricDocument,
  criterionRound,
  criterionSchema,
  rubricDocumentSchema,
  rubricSchema,
  rubricThresholdsSchema,
} from "./rubric.js";
export type { Criterion, Rubric, RubricDocument, RubricThresholds } from "./rubric.js";

export {
  claimSchema,
  dossierSchema,
  evidenceItemSchema,
  foundBySchema,
  ideaSubmissionSchema,
  standardBriefSchema,
} from "./submission.js";
export type { Claim, Dossier, EvidenceItem, IdeaSubmission, StandardBrief } from "./submission.js";

export {
  shotModelOutputSchema,
  shotSchema,
  shotTypeSchema,
  volleyKindSchema,
  volleyModelOutputSchema,
  volleySchema,
} from "./volley.js";
export type { Shot, ShotModelOutput, ShotType, Volley, VolleyKind, VolleyModelOutput } from "./volley.js";

export {
  criterionJudgmentSchema,
  factCheckResultSchema,
  fightReportSchema,
  roundJudgmentSchema,
  scoredSideSchema,
  shotFactCheckSchema,
  shotVerdictKindSchema,
  shotVerdictSchema,
  suddenDeathVoteSchema,
  weighinCriterionSchema,
  weighinJudgmentSchema,
} from "./judging.js";
export type {
  CriterionJudgment,
  FactCheckResult,
  FightReport,
  RoundJudgment,
  ScoredSide,
  ShotFactCheck,
  ShotVerdict,
  ShotVerdictKind,
  SuddenDeathVote,
  WeighinJudgment,
} from "./judging.js";

export {
  broadcastScriptSchema,
  criterionResultSchema,
  cueSchema,
  fighterBuildSchema,
  matchEventSchema,
  matchResolutionSchema,
  roundResolutionSchema,
  tiebreakRecordSchema,
} from "./log.js";
export type {
  BroadcastScript,
  CriterionResult,
  Cue,
  FighterBuild,
  MatchEvent,
  MatchResolution,
  RoundResolution,
  TiebreakRecord,
} from "./log.js";

export {
  LLM_OUTPUTS,
  buildLlmJsonSchemas,
  formatJsonSchema,
  llmSchemas,
  mistralResponseFormat,
  nullsToUndefined,
  parseMistralOutput,
  safeParseMistralOutput,
  toMistralJsonSchema,
} from "./mistral.js";
export type { JsonSchema, MistralResponseFormat } from "./mistral.js";

export { loadLlmJsonSchemas } from "./load-generated.js";

export { generatedSchemaDir, repoRoot, vcDefaultRubricPath } from "./paths.js";
