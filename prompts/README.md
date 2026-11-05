# Prompts

One file per agent role. The orchestrator loads each file, hashes its content into the fighter build, and fills `{{placeholders}}` with Mustache-style substitution. Sections marked `## system` and `## user` become the system and user messages.

| File | Role | Model | Output type in contracts.ts |
|---|---|---|---|
| [brief.md](brief.md) | Rewrite a submission into the Standard Brief | Utility | `StandardBrief` |
| [researcher.md](researcher.md) | Build the dossier with `web_search` | Fighter model | `Dossier` + evidence |
| [weighin_judge.md](weighin_judge.md) | Absolute score for one idea | Judge | `WeighinJudgment` |
| [fighter.md](fighter.md) | Scouting, volleys and closings | Fighter model | `Volley` shots |
| [fact_checker.md](fact_checker.md) | Entailment check of cited evidence | Utility | `ShotFactCheck.perEvidence` |
| [round_judge.md](round_judge.md) | Pairwise round scoring | Judge | `RoundJudgment` |
| [sudden_death_judge.md](sudden_death_judge.md) | Forced choice on a draw | Judge | `SuddenDeathVote` |
| [fight_report.md](fight_report.md) | Why the winner won, plus announcer lines | Utility | `FightReport` |

Rules for every template:

- Untrusted text (ideas, briefs, dossiers, evidence snippets, volleys) always goes inside XML-style data tags: `<idea>`, `<brief>`, `<dossier>`, `<evidence>`, `<volley>`. Escape any closing tag that appears inside the data.
- Judges see `Fighter 1` and `Fighter 2`. The orchestrator does the A/B mapping. Never put corner colors, seeds, archetypes, odds or submitter names into a judge prompt.
- Every structured output uses the JSON schema generated from `packages/schemas`, with field order matching the types so rationales come before scores.
- Changing any file here changes the build hash. Never edit prompts during a running tournament.
