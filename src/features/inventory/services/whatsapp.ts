// The project's WhatsApp Business connection (server/src/features/channels/whatsapp). The access
// token and app secret are write-only: the browser sends them once, and the server only ever answers
// "set". The verify token and webhook URL are shown because Meta's dashboard needs them pasted in.
import { projectFetch } from "../../../common/services/project.ts";
import { readError } from "../../../common/services/readError.ts";

export type WhatsAppStatus = {
  connected: boolean;
  // MULA_SECRET_KEY is set on the server, so secrets can be stored encrypted.
  secrets_ready: boolean;
  // MULA_PUBLIC_URL is set, so the webhook URL is a full https address.
  public_url_set: boolean;
  phone_number_id?: string;
  waba_id?: string;
  access_token?: "set";
  app_secret?: "set";
  webhook_url?: string;
  verify_token?: string;
  verified_at?: number | null;
  last_event_at?: number | null;
  reopen_template?: string;
  reopen_language?: string;
};

export type ConnectDraft = {
  phone_number_id: string;
  waba_id: string;
  access_token: string;
  app_secret: string;
  reopen_template: string;
  reopen_language: string;
};

export type ConnectErrors = Partial<Record<keyof ConnectDraft, string>>;

/** What the owner does in Meta's dashboard, in order (also in features/channels/whatsapp/README.md). */
export const META_CHECKLIST = [
  "In Meta for Developers, create an app of type Business and add the WhatsApp product.",
  "In WhatsApp → API Setup, add your business number. Copy its Phone Number ID and WhatsApp Business Account ID.",
  "In Business Settings → System users, create a system user, give it the app with whatsapp_business_messaging and whatsapp_business_management, and generate a permanent token.",
  "In App settings → Basic, copy the App secret.",
  "Paste these four values below and press Connect.",
  "Back in WhatsApp → Configuration, paste Mula's webhook URL and verify token, press Verify and save, then subscribe to the messages field.",
  "Optional: get a message template approved, and add its name and language here, to reply after 24 hours.",
];

export function emptyConnectDraft(): ConnectDraft {
  return { phone_number_id: "", waba_id: "", access_token: "", app_secret: "", reopen_template: "", reopen_language: "" };
}

/** The same rules as the server's ConnectInput, so mistakes show before anything is sent. */
export function connectErrors(draft: ConnectDraft): ConnectErrors {
  const errors: ConnectErrors = {};
  const value = (key: keyof ConnectDraft) => draft[key].trim();
  for (const key of ["phone_number_id", "waba_id"] as const) {
    if (!/^[0-9]{5,30}$/.test(value(key))) errors[key] = "Digits only, copied from WhatsApp → API Setup.";
  }
  if (!/^[A-Za-z0-9_\-.|]{20,1000}$/.test(value("access_token"))) errors.access_token = "Paste the permanent token exactly, with no spaces.";
  if (!/^[A-Za-z0-9_\-.|]{16,200}$/.test(value("app_secret"))) errors.app_secret = "Paste the App secret exactly, with no spaces.";
  const template = value("reopen_template");
  const language = value("reopen_language");
  if (template && !/^[a-z0-9_]{1,512}$/.test(template)) errors.reopen_template = "Lowercase letters, digits and underscores, as Meta shows it.";
  if (language && !/^[a-z]{2,3}(_[A-Z]{2})?$/.test(language)) errors.reopen_language = "A language code such as en_US or id.";
  if (template && !language && !errors.reopen_template) errors.reopen_language = "Give the template's language too.";
  if (language && !template && !errors.reopen_language) errors.reopen_template = "Give the template's name too.";
  return errors;
}

export function cleanConnectDraft(draft: ConnectDraft): ConnectDraft {
  return {
    phone_number_id: draft.phone_number_id.trim(), waba_id: draft.waba_id.trim(), access_token: draft.access_token.trim(),
    app_secret: draft.app_secret.trim(), reopen_template: draft.reopen_template.trim(), reopen_language: draft.reopen_language.trim(),
  };
}

const FALLBACK = "The WhatsApp connection couldn't do that. Please try again.";

async function request(path: string, init: RequestInit = {}) {
  const response = await projectFetch(path, { cache: "no-store", ...init });
  if (!response.ok) throw new Error(await readError(response, FALLBACK));
  return response;
}

export async function whatsappStatus(signal?: AbortSignal): Promise<WhatsAppStatus> {
  return (await request("/api/channels/whatsapp", { signal })).json();
}

export async function connectWhatsApp(draft: ConnectDraft): Promise<WhatsAppStatus> {
  const body = JSON.stringify(cleanConnectDraft(draft));
  return (await request("/api/channels/whatsapp", { method: "PUT", headers: { "Content-Type": "application/json" }, body })).json();
}

export async function disconnectWhatsApp(): Promise<void> {
  await request("/api/channels/whatsapp", { method: "DELETE" });
}

export type CheckResult = { ok: boolean; message?: string; display_phone_number?: string; verified_name?: string };

export async function checkWhatsApp(): Promise<CheckResult> {
  return (await request("/api/channels/whatsapp/check", { method: "POST" })).json();
}
