# WhatsApp (Business Cloud API)

One WhatsApp Business number per project, answered by the Customer Service agent (`support`). Only
`graph.py` talks to Meta (`graph.facebook.com/<MULA_WHATSAPP_GRAPH_VERSION>`, default `v23.0`).

## Secrets

The access token, app secret and Mula's verify token are stored AES-256-GCM encrypted
(`common/secrets.py`, key `MULA_SECRET_KEY`, 64 hex characters), each bound to its purpose. The API
answers `"set"` for the token and secret, never the value; the verify token is shown to the owner because
Meta's dashboard needs it. Without `MULA_SECRET_KEY`, Connect answers 503 saying what to add.

## The webhook

`/api/channels/whatsapp/webhook/<connection id>`: one URL per connection, so the app secret is known before
the body is parsed. With `MULA_PUBLIC_URL` set, the status shows the full address, for example
`https://43-173-36-209.sslip.io/api/channels/whatsapp/webhook/<id>` (Caddy passes `/api/*`).

- **GET** (Meta's check): `hub.mode=subscribe` and the verify token, compared in constant time, echo
  `hub.challenge` and set `verified_at`. A wrong token and an unknown connection both answer 403.
- **POST**: the body is read raw (1 MB cap) and `X-Hub-Signature-256` checked with HMAC-SHA256 under the app
  secret **before** parsing (401 on a missing or wrong signature). Each change must carry this connection's
  `metadata.phone_number_id`, otherwise it is ignored and logged without content: a message reaches only the
  workspace that owns the number. Messages are stored (duplicates dropped by message id) and answered in a
  background task after a quick 200, so Meta doesn't retry. Status events (sent, delivered, read, failed)
  update the stored message.

## Sending (`graph.py`)

Text and template messages. 429 and 5xx are retried after 1, 2 and 4 seconds, honouring `Retry-After` (at
most 30 s); other errors aren't retried. Errors carry Meta's code and title, never the token. **Check**
(`POST /api/channels/whatsapp/check`) reads the number's display name with the stored token: free, sends nothing.

## Owner API

`GET`/`PUT`/`DELETE /api/channels/whatsapp`, `POST /api/channels/whatsapp/check`. A number already connected
to another workspace is refused with 409. Reconnecting keeps the webhook id and verify token, so what is pasted
in Meta keeps working. Disconnecting forgets the number and secrets; conversations and tickets stay.

## Meta setup checklist

1. In [Meta for Developers](https://developers.facebook.com/apps), create an app of type **Business** and add
   the **WhatsApp** product.
2. In **WhatsApp → API Setup**, add your business phone number. Copy its **Phone Number ID** and the
   **WhatsApp Business Account ID**.
3. In **Business Settings → Users → System users**, create a system user, assign it the app with the
   `whatsapp_business_messaging` and `whatsapp_business_management` permissions, and generate a **permanent token**.
4. In **App settings → Basic**, copy the **App secret**.
5. In Mula, **Inventory → WhatsApp Business → Connect WhatsApp**: paste the four values and press Connect.
6. Copy Mula's **webhook URL** and **verify token** from the card into **WhatsApp → Configuration →
   Webhook**, press **Verify and save**, then subscribe to the **messages** field. The card then shows
   "Verified by Meta".
7. Optional: get a message template approved and add its name and language on the card, to reply after 24 hours.
8. In **My agents → Add agent → Start from: Customer Service**, keep WhatsApp ticked, and add your products,
   prices and hours on the **Knowledge base** page. While testing, switch on **Only these numbers** in the
   agent's Customer service tab.

Tests: `tests/test_webhook.py` (Graph through `httpx.MockTransport`, the runtime mocked; no network).
