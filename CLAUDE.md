# PHAEDRA — Project Instructions

## What this is
Open-source DAW (Digital Audio Workstation) based on Ardour. Current release: Phaedra Lite v0.1.0-preview.5 (Windows/Linux), preview.4 (macOS).

## Instagram Agent Skills

14 skills installed in `.claude/skills/ig-*/` for Instagram content creation and management on @phaedrasound.

### Configuration
- **Voice profile:** `~/.instagram-agent/voice.md` — every skill reads this before generating content
- **Activity log:** `~/.instagram-agent/log.md` — skills append entries here
- **Swipe file:** `~/.instagram-agent/swipe.md` — collected reels for `/ig-viral` analysis
- **PostZen MCP:** configured in `.mcp.json` with Bearer auth via `POSTZEN_API_KEY` env var
- **PostZen account:** `j9728s2139w1qrqdte0fynrjf98hbg4j` (@phaedrasound)
- **Metricool brand:** 7780378 — handles scheduling for approved posts (do not duplicate in PostZen)

### Safety rules
- Never publish without owner approval
- Never announce unreleased features or stable versions that don't exist
- No automated follows, mass likes, spam, or comments on other accounts
- Metricool owns scheduling for already-approved posts — PostZen is for drafts and engagement tools
- The `POSTZEN_API_KEY` must never be committed to the repo or printed in output

### Available skills
`/ig-reel` `/ig-viral` `/ig-caption` `/ig-carousel` `/ig-story` `/ig-profile` `/ig-plan` `/ig-human` `/ig-comment` `/ig-reply` `/ig-dm` `/ig-repurpose` `/ig-audit` `/ig-publish`

### PostZen REST bridge
`tools/postzen/` — Node.js ESM, no external deps. Run `npm test` from that directory. CI: `.github/workflows/postzen-bridge.yml`.

## Docs
- `docs/instagram-agent-skills/README.md` — full skill documentation
- `docs/instagram-agent-skills/POSTZEN-OPERATIONS.md` — operational details and safety notes
- `docs/instagram-agent-skills/voice-phaedra.md` — voice profile (repo copy)
- `docs/instagram-agent-skills/voice-template.md` — blank template
