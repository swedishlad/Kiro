# Gate 0 + prep (written Oct 23; on Oct 24 do Gate 0 at check-in)

## Gate 0: ask before you build (do this first)
The event page (re-read Oct 23) **does** state: Kiro is required for vibe-coded projects, teams up to 4, submission = SundAI card + GitHub repo by 8 PM. It does **not** state whether pre-existing code, data or plans are allowed, nor the judging criteria ("ask your campus host"). Ask a host at check-in.

Message for the Sundai Discord (copy and edit):
> Hi! Two quick questions for today (Energy & climate tech track): (1) Is it OK to start with (a) public data already downloaded and cleaned (federal and state electricity data, town boundaries), (b) Kiro agent/config files and a written plan, and (c) a project scaffold? Or should all code be written after 11:30? (2) Where can we see the judging criteria or rubric? Thanks!

| Answer | What the repo contains at 09:00 | How the gates still work |
|---|---|---|
| **Everything allowed** | The whole kit | As written |
| **Data + plans OK, no code** | Docs, steering, agent configs, contracts, `data/snapshot/`. **Remove `reference/` and `scaffold/`** (keep them on your laptop outside the repo) | At W0b, the orchestrator has one agent re-create `verify_snapshot.py`, `verify_usage.py`, `check_ownership.py` and the scaffold from `docs/apis/01` §4, `docs/apis/08`, `data/snapshot/README.md`, `docs/ops/gates.md` and `docs/ops/scaffold.md` (≈ 30 min; the numbers in those docs are the spec). All other gate commands stay the same. W1 starts ≈ 12:15 |
| **Nothing allowed** | An empty repo; the kit as personal notes (if notes are allowed) | Same as above, plus the agents re-create the snapshot by re-running the parse (`docs/apis/01-massgov-basic-service-xlsx.md` §2) |
| **No answer at check-in** | Use the "data + plans" version (the cautious reading) | Ask again at the 9:40 rules talk; switch up to "everything" only on a clear yes |

## Steps (≈ 2 h total)
1. **Accounts:** Kiro sign-in works; Vercel account; GitHub repo created (private until submission if allowed).
2. **Environment:**
   - Node ≥ 20.9
   - `python3 -m pip install openpyxl==3.1.5 jsonschema==4.26.0`
   - `npx playwright install chromium` (downloads the browser now, not on venue Wi-Fi)
3. **Check the data is current:** open the Mass.gov landing page and confirm the file label still reads "Basic Service Rates 7.2.2026". If it changed, follow `docs/apis/01-massgov-basic-service-xlsx.md` §5.
4. **Kiro smoke test** (docs/apis/04 §5). If sub-agents misbehave, decide now to run one session with pasted briefs.
5. **(If code is allowed)**
   - Run the scaffold in a scratch folder (`docs/ops/scaffold.md`) so `npm ci` and the downloads are cached.
   - Deploy the scaffold to Vercel once (proves the G-REL plumbing).
   - Run `reference/build_geo.mjs` once.
6. **Layer research head start (research, allowed either way):** spend 30 min on the L1 leads (docs/apis/06) in a normal browser. Record what you find in `research/map_layers.md`.
7. **Teammate:** read `docs/specs/ui.md`; sketch the 4 cards; pick the type scale.
