# Lucio Skill Library (on-demand)

The v9.6 GROK Build Agent Skill Expansion (8,115 skills) is installed on disk at:

```
C:\Users\USER\Desktop\LucioDigital\Lucio-Skill-Library
```

It is deliberately NOT indexed by Kimi (context budget). Five umbrella skills in the
Kimi skills directory route to it on demand:

| Umbrella skill | Covers |
| --- | --- |
| `lucio-build-agent` | Autonomous coding workflow, Grok/Kimi-K3 runtime, agent SDK, job isolation, version approval |
| `lucio-web-experience` | Site architect, LD style system, cinematic/motion/composition engines, media, publishing, SEO |
| `lucio-growth-operations` | Business discovery, marketing, sales outreach, CRM, client success, commerce, budget |
| `lucio-platform-engineering` | Software/frontend/backend engineering, data, devops, quality, security, provenance |
| `lucio-agency-roster` | ~1,600 agency agents across 18 departments, discover→handoff phase model |

## Lookup

```
node "C:\Users\USER\Desktop\LucioDigital\Lucio-Skill-Library\scripts\find-skill.mjs" <keyword...>
```

Matches ALL keywords against skill slugs; prints up to 12 matches with the folder path
and description. Read the SKILL.md at the printed path only when its capability is needed.

## Skill matrix convention

`<category>-<capability>-<aspect>-<phase>` — aspect: strategy | architecture | operations |
assurance; phase: discover | plan | execute | verify | handoff.

## Roster references (library root)

- `UNIFIED_AGENT_ROSTER_FINAL.md` / `.csv` — complete unified roster
- `AGENCY_AGENTS_ROSTER_AND_CASES.md` — departments, roles, cases
- `AGENT_SCENARIOS_AND_CASES_FINAL.md` — scenario library
- `skills-index.csv`, `agents-index.csv` — machine indexes
