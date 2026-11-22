# Inbox (client)

The **Inbox** page (`/projects/<id>/inbox`, and `/inbox`), after Board in the sidebar: customers the Customer
Service agent handed to the owner. Backend: `server/src/features/support/README.md`.

- **Open** and **Resolved** tickets, newest first: the customer, the reason and when.
- A ticket opens its conversation: the reason and the agent's summary, an older-turns summary when there is
  one, every message with its author and delivery status (*Not delivered: <Meta's reason>* when sending failed).
- The reply area follows `replyState()`:
  - inside WhatsApp's 24-hour window: a reply box, with the hours left;
  - after it: only **Send template** (the connection's approved template), with the reason;
  - after the customer sent STOP: nothing can be sent, and it says why.
- **Resolve** closes the ticket and lets the agent answer that customer again.
- While open, the page refreshes every 20 seconds (no model is called).

| File | Purpose |
|---|---|
| `services/inbox.ts` | API calls, `replyState`, `hoursLeft`, `contactLabel`, `messageStatus` |
| `components/InboxPage.tsx`, `ConversationPanel.tsx` | The page and one conversation |
| `inbox.css` | Styles |
| `tests/inbox.test.mjs` | Window and opt-out states, labels |

Proxy routes: `src/app/api/support/**` (ids checked as 32 hex characters, 8 KB body cap).
