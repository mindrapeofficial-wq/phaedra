# Creator conversation and images

- Images use `gpt-image-2.5-sunburst`, quality `max` (shown to users as Pro). No silent fallback to a different model or quality.
- Image art direction defaults to music covers for singles, EPs and albums: square composition, thumbnail readability, client-supplied artistic identity and optional exact typography. These directions reach both the chat and actual image API, including photo edits. Explicit requests for other deliverables override the default; no music genre, lettering or decorative music symbols are invented.
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

## Community onboarding and cover briefs

- Social Banana is a creator community, not a default Phaedra account assistant. Owner account details are only passed to the owner's chat. Strategy follows the actual client's project.
- A first join event welcomes human members by name and offers a user-initiated private chat (`/start welcome`). A first greeting also handles members whose join event was missed. `profile.welcomedAt` prevents repeated welcomes. The bot never starts an unsolicited DM.
- Only messages written by users in the same group are included as recent community context; private chat profiles are not included. Legacy assistant claims associating every client with the owner are explicitly treated as mistakes.
- Cover generation first collects artist, title, label, optional graphic elements and a visual prompt. Clients may omit all text and extras explicitly. The original photo remains the editing input, always at Pro/max quality.
- Proactive suggestions can follow up on recent public group goals, with a 90-minute minimum interval and an 8-minute quiet period. It can skip when there is nothing useful to add.

## Optional Google Drive archive

The private destination folder is `1HMbGsfaj7vDyF7QkyWgTTqSJ06JJr2Dr`. Uploads are disabled until Render has `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REFRESH_TOKEN`. Set credentials through Render's secret environment settings, never source control or chat. The OAuth identity must have Drive API enabled, offline authorization and access to the destination folder. A `drive.file` grant needs this existing folder explicitly authorized for that application, for example through Google Picker; access by a separate connector alone is insufficient.

`GOOGLE_DRIVE_FOLDER_ID` optionally overrides the destination. Finished PNGs are copied to `Cliente <telegram_id>` folders without changing sharing permissions. Original reference photos, private profiles and chat histories are not uploaded. Missing credentials leave Telegram delivery working; upload failure is reported after delivery. This is ready for configuration, not an active Drive connection.

Verification: `node --test tools/telegram-bot/reference-image.test.js tools/telegram-bot/drive.test.js`. Drive requests are mocked; live OAuth authorization is still required.
