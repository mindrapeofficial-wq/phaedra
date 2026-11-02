# Creator conversation and images

- Images use `gpt-image-2.5-sunburst`, quality `max` (shown to users as Pro). No silent fallback to a different model or quality.
- `/imagen <prompt>` and `prompt: <prompt>` send the user's prompt directly. Otherwise chat can assemble a prompt from the conversation.
- Original Telegram photo IDs, face-style answers, latest image prompt, recent 40 conversation messages, and explicitly supplied profile facts are stored in `public.sb_bot_memory` under `(chat_id, telegram_id)`. Generated images never replace the original reference.
- Photo inspection asks whether a visible face belongs to the user and whether photorealism is wanted. Identity is self-reported, not recognized from faces. No generation occurs while the photorealism question is pending.
- `/mimemoria` shows the private conversation's profile. `/olvidame` deletes the caller's memory in the current conversation. Private conversation state is not loaded into group conversations.
- The table is backend-only: RLS enabled, no anon/authenticated grants or policies, service_role CRUD. Created by remote migration `social_banana_private_bot_memory`. Existing `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are used.
- Network calls have deadlines. Image generation has a 240-second deadline, with a progress message before generation. These are estimates, not availability guarantees. In-flight work is not a durable job and can be interrupted by a deployment.
- Webhook requests require Telegram's secret header. Startup registers a stable secret derived from the bot token (or `TELEGRAM_WEBHOOK_SECRET`) and logs success without exposing it.
- Group proactive checks use public account comments and previous suggestions; they do not expose private client profiles or DMs. They skip unchanged or non-actionable activity.
- Memory begins with messages received after deployment; Telegram cannot supply the bot's full previous chat history through the Bot API.

Verification: `node --test tools/telegram-bot/reference-image.test.js`. It mocks external services and checks original bytes, Pro quality, face gate, follow-ups, prompt preservation, error handling, isolation, and forgetting. Real model availability and output quality require an actual provider request.
