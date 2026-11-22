# Customer support (conversations, handoff tickets, the inbox)

Channel-independent: a channel (today only `channels/whatsapp`) records inbound messages here and
registers how to send (`SENDERS[channel] = {"text": ..., "template": ...}`). Everything else, from deciding
whether to answer to the owner's inbox, lives in this feature.

## Tables (migration `0006_customer_service`)

- `support_conversations`: one per `(project, channel, contact)`; `mode` `agent` or `human`, `opted_out`,
  `last_inbound_at` (the 24-hour window), `summary` of older turns.
- `support_messages`: direction, author (`customer`, `agent`, `owner`, `system`), body, the channel's
  message id `external_id` (UNIQUE, so a redelivered message is stored once), delivery `status` and `error`.
- `support_tickets`: a handoff with its reason and summary; one open ticket per conversation.
- `support_settings`: the agent's tone, the WhatsApp switch and the optional allowlist.
- `agent_tickets.conversation_id`: a tool call made while answering a customer knows which conversation it serves.

## Handling one message (`process` → `handle`)

An asyncio lock per conversation keeps messages in order. Then, first match wins:

1. **STOP** (`stop`, `unsubscribe`, `stop all`, `berhenti`, `cancel`): opt out, no reply. While opted out,
   messages are stored and never answered. **START** (`start`, `unstop`, `mulai`) opts back in with one confirmation.
2. Customer Service isn't added to the project, or WhatsApp is switched off for it: stored, no reply.
3. **Allowlist** on and the sender isn't on it: stored, no reply.
4. **Rate limit**: more than 6 customer messages in 10 minutes: stored, no model call, no reply.
5. **Human mode** (a ticket is open): the agent stays quiet; the owner answers from the inbox.
6. Not text (image, voice, …): stored as `[image message]` and answered "I can only read text messages for now".
7. **Empty knowledge base**: no model call; the handoff reply plus a ticket.
8. Otherwise **one agent turn** on a fresh runtime session (Mula controls the context): the knowledge base,
   the summary plus the last 20 messages, the customer's text marked as untrusted. The reply goes through the
   grounding guard (`knowledge/grounding.py`), then the 24-hour check, then the channel. More than 30
   unsummarized messages trigger one summarizing call.

The agent hands off with `handoff_create` (orders, refunds, changes, personal data, files, complaints, anything
it can't answer from the base): a ticket opens and the conversation switches to human mode. Its only other tool
is `knowledge_search`; nothing it has moves money, changes orders or shares files.

## The 24-hour window

Free-form messages are sent only while `now - last_inbound_at < 24 h` (`OutsideWindow` otherwise). The agent
never sends outside it; the owner's reply is refused with 409 and an explanation, and **Send template** sends
the connection's approved template instead.

## Inbox API (`routes.py`)

`GET /api/support/tickets?status=open|resolved`, `GET /api/support/conversations/{id}`, `POST …/{id}/reply`
(1–1,500 characters; 409 outside the window or when opted out), `POST …/{id}/template`, `POST
/api/support/tickets/{id}/resolve` (the conversation goes back to the agent). Another project's ids are 404.

## Limits

Text only. Background work runs in the API process: a restart mid-reply drops that reply (logged), and the
customer can write again. Logs carry ids and statuses, never message text or phone numbers.

Tests: `tests/test_customer_service.py` (the runtime mocked, sends captured; no network).
