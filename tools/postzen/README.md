# Phaedra Instagram Agent Skills + PostZen Bridge v1.1.0

Node.js (20+) integration using the **PostZen REST API**. No npm dependencies.
This bridge is **not** the separate Social Banana extension, and not a native ChatGPT MCP installation.

## Real account (verified 2026-10-31)

- Instagram: `@phaedrasound`
- PostZen account ID: `j9728s2139w1qrqdte0fynrjf98hbg4j`
- Connected: yes, checked with `GET /v1/accounts`.
- Existing draft: `m1767zvcde9ked9gpx7stxbchd8hbjy9` (`Hello from PostZen 👋`). Do NOT create it again.
- Active PostZen automations (confirmed by GET after creation):
  - `qs74sd3yx608n5f54sred8wmm58hbc8s` — exact `INFO` under a post → DM and public reply.
  - `qs7a61g14qgm15r3ex1dxw95b58ha0gn` — exact `INFO` in a story reply → DM.
- Both rules use the same nonpromotional Phaedra project information, referring to `https://phaedra.com.es/`.

## Security

Set `POSTZEN_API_KEY` as a **private** environment variable. It must NOT appear in source, prompts, terminal history, source control, public URLs, frontend JavaScript or shared example files. `.gitignore` excludes `.env` files. Rotate the key if it has been shared publicly.

```bash
# In your system's secure environment / secret manager:
# POSTZEN_API_KEY=(value entered privately)
export POSTZEN_INSTAGRAM_ACCOUNT_ID=j9728s2139w1qrqdte0fynrjf98hbg4j
npm test
npm run inspect
```

`npm run inspect` checks accounts, up to 20 posts, automation state and **inbox conversation count only**, without exposing message content or participants.

## Create a new Instagram draft

```bash
npm run draft -- --account j9728s2139w1qrqdte0fynrjf98hbg4j \
  --content 'My new copy' --image-url 'https://example.com/image.png' \
  --request-id 'unique-new-campaign-piece-id'
```

Use an idempotent request ID to avoid duplicates when retrying. The function always sends `isDraft:true`. Never rerun the 2026-10-31 Hello example to create another copy.

## Approved, targeted comment reply

```bash
npm run reply:comment -- --post POST_ID --comment COMMENT_ID \
  --message 'Gracias por tu comentario.' --approve-send
```

## Approved DM reply to an **existing** conversation

```bash
npm run reply:dm -- --conversation CONVERSATION_ID \
  --message 'Gracias por escribirnos.' --request-id 'unique-message-id' --approve-send
```

Only reply inside Meta's allowed conversation window, currently 24 hours. Neither command discovers strangers or starts new DM threads. Without `--approve-send`, no outbound message is submitted.

## Event-driven automation

The two `INFO` rules run inside PostZen from Instagram webhooks. No cron, always-on computer, local CLI or separate daemon is necessary. They are opt-in: the other person must write exactly `INFO` in a comment or story reply. Other comments and DMs are not automatically answered by these rules.

Manage automations: https://app.postzen.dev/ . Do not create duplicate rules.

## Native MCP setup (separate from this bridge)

In a client that supports configurable remote MCP, register `https://mcp.postzen.dev/mcp`. Use interactive OAuth 2.1 or a private bearer header. ChatGPT's current connected plugin directory does not expose PostZen as an installed plugin in this conversation. Do not assume native MCP registration is completed by adding these files.

Official references:
- https://www.postzen.dev/agent-quickstart.md
- https://docs.postzen.dev/api-reference
- https://docs.postzen.dev/comment-automations
- https://docs.postzen.dev/inbox
- https://www.postzen.dev/mcp/instagram