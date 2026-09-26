# BLOCKERS

## B1 — Canonical unified agent/skill catalog not supplied (OPEN)
- Sections: manual §1.3, K8
- The canonical Master Agent Registry package (1,667+ agents / 8,287+ skills / 94+ commands source assets) is not present in the workspace.
- Per K8 anti-fabrication rule: registry schema, importers, validators and integration points may be built, but catalog-dependent gates remain BLOCKED until real source assets are supplied. No fake counts are generated.

## B2 — Companion services not available in this dev environment (OPEN)
- Sections: manual §3, §7, §8, §11
- Docker/Compose, GPU inference (vLLM), LiveKit, OpenBao, Valkey, Coolify, S3-compatible storage are not provisioned in this single-machine dev build.
- Impact: Phases involving voice (§8), hardened sandboxing (§10), deployment control plane (§11) and microVM isolation cannot be fully evidenced here; they are scaffolded behind interfaces and marked NOT EVIDENCED until infrastructure exists.

## B3 — Live discovery providers not connected (OPEN)
- Sections: v28 §17.13.2, §17.13.14, §17.13.16, §17.13.22
- Maps/place providers, licensed directories, business registries and web search adapters require credentials,
  licensing review and permitted-use verification. Per §17.13.22 the adapter contract is implemented and tested with
  fixture + user-supplied sources; live validation remains explicitly pending. No live results are fabricated.
