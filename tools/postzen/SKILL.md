---
name: postzen-phaedra-instagram
summary: Use PostZen to manage the authorized Phaedra Instagram account via a narrow REST bridge. Prefer verified MCP tools if available.
---

# Phaedra Instagram — operating skill

Account: `@phaedrasound` — `j9728s2139w1qrqdte0fynrjf98hbg4j`.

1. Never disclose or hardcode `POSTZEN_API_KEY`. Load it via a private environment secret only.
2. Before actions, `npm run inspect` or use PostZen `listAccounts` / `listCommentAutomations`, and verify identity and scopes.
3. Read only: list accounts, posts, keyword automations and inbox counts. Do not include private conversation text in summaries without a user request.
4. Content preparation: use the Phaedra Drive editorial guide and voice file. Create new posts in `isDraft:true`, no publication unless the exact post, account and time are expressly authorized.
5. PostZen has two live consent-driven rules (`INFO`): comment and story reply. They have already been created. Never create duplicate automations.
6. Direct replies: only respond to a comment on our own post with a verified target, or within an existing inbound DM conversation's allowed time window. Require review/approval for a direct outgoing message; the CLI enforces `--approve-send`.
7. Do not send unsolicited DMs, mass comments, mass follows or pretend to watch other people's stories. Meta/PostZen do not permit these through the official API.
8. Record action ID, account, endpoint outcome and any errors. Don't repeat uncertain sends; DM replies should have unique idempotency keys.
9. Phaedra releases remain in development; don't claim a build is stable without current verification.
10. Keep existing Metricool scheduling untouched: it is a separate source and does not become a PostZen post automatically.

Official guide: https://www.postzen.dev/agent-quickstart.md