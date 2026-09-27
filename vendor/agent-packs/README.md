# Vendored Agent Packs

Agent definition packs integrated into the Lucio AI Platform real-time agent
directory. Both upstream projects are MIT-licensed; their LICENSE files are
preserved verbatim in each pack directory.

| Pack | Upstream | License | Vendored content |
|---|---|---|---|
| `500-ai-agents-projects/` | 500-AI-Agents-Projects (ashishpatel26) | MIT | `LICENSE`, upstream `README.md`, and each agent's `metadata.yaml` + `README.md` (21 agents) |
| `agency-agents/` | agency-agents (AgentLand) | MIT | `LICENSE`, upstream `README.md`, `divisions.json`, and every division's agent `.md` files (18 divisions) |

## Deliberately excluded (and why)

- **Python entrypoints (`agent.py`, `requirements.txt`)** — the 500-pack agents
  are LangGraph/Python templates. The Lucio platform executes agents through its
  own model gateway (sovereign engine + provider registry), not a Python runtime,
  so the code templates are not vendored. The agent *definitions* (metadata,
  description, tags, README intent) drive the Lucio runtime personas.
- **`.env.example` files** — secrets hygiene; placeholder credential files are
  never vendored.
- **`scripts/`, `examples/`, `integrations/`, `.github/`** — upstream build/CI
  tooling and conversion outputs, not agent definitions.

## Runtime model

At boot, `server/services/agentPacks.js` walks these directories, parses each
agent definition (YAML frontmatter for agency agents; `metadata.yaml` for the
500 pack), and upserts rows into the `agent_directory` table. Organizations
enable agents from the directory; enabled agents answer in real time via the
SSE chat endpoint (`/api/agents/:id/chat`), grounded on their vendored persona,
the organization's live app context, and the conversation history. See
`THIRD_PARTY_NOTICES.md` for full attribution.
