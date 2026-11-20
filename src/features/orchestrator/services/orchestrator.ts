// The account's own assistant: onboarding, its profile (USER.md), personality and chat. None of
// these belong to a project, so they use plain fetch, without the project header.

export type Field = "name" | "business" | "help" | "style";
export type About = Record<Field, string | null>;
export type PersonalityKey = "tone" | "formality" | "language" | "emoji";
export type Personality = Record<PersonalityKey, string>;
// "assistant_name" is the first question: what the owner calls their assistant (its SOUL.md, not USER.md).
export type Question = "assistant_name" | Field;
export type Step = Question | "summary" | "personality" | "done";

export type OnboardingState = {
  status: "active" | "done";
  finished: "completed" | "skipped" | null;
  step: Step;
  // The welcome: spoken once to a new account and shown word for word as the first chat line.
  greeting: string;
  // True until the owner starts the spoken welcome (or chooses to read it). Once per account.
  welcome_pending: boolean;
  assistant_name: string;
  assistant_name_given: boolean;
  questions: { id: Question; question: string; placeholder: string }[];
  about: About;
  personality: Personality | null;
  personality_options: Record<PersonalityKey, string[]>;
};

export type AssistantMessage = { id: number; role: "user" | "assistant"; text: string };

/** A project the assistant proposed. Nothing exists until the owner confirms it. */
export type ProjectProposal = {
  id: string;
  name: string;
  description: string | null;
  status: "pending" | "created" | "declined";
  project_id: string | null;
  message_id: number | null;
};

export type AssistantSettings = { name: string; name_given: boolean; default_name: string; tools: string[] };

// The project as the workspace lists it (the same shape as features/workspace's Project).
export type CreatedProject = {
  id: string;
  name: string | null;
  display_name: string;
  description: string | null;
  role: "owner" | "member";
  created_at: string;
};

export const FIELD_LABELS: Record<Field, string> = {
  name: "Name",
  business: "Business",
  help: "Wants help with",
  style: "How to answer",
};

export const PERSONALITY_LABELS: Record<PersonalityKey, { label: string; options: Record<string, string> }> = {
  tone: { label: "Tone", options: { warm: "Warm", neutral: "Neutral", playful: "Playful" } },
  formality: { label: "Formality", options: { casual: "Casual", formal: "Formal" } },
  language: { label: "Language", options: { en: "English", id: "Bahasa Indonesia" } },
  emoji: { label: "Emoji", options: { none: "No emoji", some: "Some emoji" } },
};

export const DEFAULT_PERSONALITY: Personality = { tone: "warm", formality: "casual", language: "en", emoji: "none" };

export class AssistantError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function call<T>(path: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const options: RequestInit = { method, cache: "no-store", signal };
  if (body !== undefined) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }
  const response = await fetch(path, options);
  if (!response.ok) {
    let detail = "Something went wrong. Please try again.";
    try {
      const failure = await response.json();
      if (typeof failure.detail === "string") detail = failure.detail;
      // FastAPI's validation errors are a list; show the first rule that failed.
      if (Array.isArray(failure.detail) && typeof failure.detail[0]?.msg === "string") detail = failure.detail[0].msg.replace(/^Value error, /, "");
    } catch {
      // Not JSON (a proxy or network page): keep the general message.
    }
    throw new AssistantError(detail, response.status);
  }
  return response.json() as Promise<T>;
}

export function fetchOnboarding() {
  return call<OnboardingState>("/api/onboarding");
}

export function answerQuestion(step: Question, answer: string) {
  return call<OnboardingState>("/api/onboarding/answer", "POST", { step, answer });
}

export function skipStep(step: Exclude<Step, "done">) {
  return call<OnboardingState>("/api/onboarding/skip", "POST", { step });
}

export function skipAll() {
  return call<OnboardingState>("/api/onboarding/skip-all", "POST");
}

/** Accept the summary; with `about`, the owner's edits replace the answers first. */
export function confirmSummary(about: About | null) {
  return call<OnboardingState>("/api/onboarding/summary", "POST", { about });
}

export function choosePersonality(personality: Personality) {
  return call<OnboardingState>("/api/onboarding/personality", "POST", personality);
}

/** The owner started the spoken welcome, or chose to read it: it won't be offered again. */
export function markWelcomeHeard() {
  return call<OnboardingState>("/api/onboarding/welcome", "POST");
}

export function restartOnboarding() {
  return call<OnboardingState>("/api/onboarding/restart", "POST");
}

export function fetchProfile() {
  return call<{ about: About; personality: Personality | null }>("/api/orchestrator/profile");
}

export function saveAbout(about: About) {
  return call<{ about: About }>("/api/orchestrator/profile", "PUT", about);
}

export function savePersonality(personality: Personality) {
  return call<{ personality: Personality }>("/api/orchestrator/personality", "PUT", personality);
}

export function fetchAssistantSettings() {
  return call<AssistantSettings>("/api/orchestrator/assistant");
}

/** A blank name goes back to the default. */
export function saveAssistantSettings(name: string, proposeProjects: boolean) {
  return call<AssistantSettings>("/api/orchestrator/assistant", "PUT", { name, propose_projects: proposeProjects });
}

export function fetchAssistantMessages() {
  return call<{ messages: AssistantMessage[]; proposals: ProjectProposal[] }>("/api/orchestrator/conversation");
}

/** `signal` lets the owner stop waiting; the server still finishes the turn and keeps it in the conversation. */
export function sendAssistantMessage(message: string, signal?: AbortSignal) {
  return call<{ reply: string; truncated: boolean; message_id: number; proposals: ProjectProposal[] }>("/api/orchestrator/chat", "POST", { message }, signal);
}

export function confirmProposal(id: string) {
  return call<{ proposal: ProjectProposal; project: CreatedProject }>(`/api/orchestrator/proposals/${encodeURIComponent(id)}/confirm`, "POST");
}

export function declineProposal(id: string) {
  return call<{ proposal: ProjectProposal }>(`/api/orchestrator/proposals/${encodeURIComponent(id)}/decline`, "POST");
}

/** Proposals grouped under the reply that made them. */
export function proposalsByMessage(proposals: ProjectProposal[]) {
  const grouped = new Map<number, ProjectProposal[]>();
  for (const proposal of proposals) {
    if (proposal.message_id === null) continue;
    const list = grouped.get(proposal.message_id) ?? [];
    list.push(proposal);
    grouped.set(proposal.message_id, list);
  }
  return grouped;
}

/** The chat lines for onboarding so far: the welcome, then each question with its answer. */
export function onboardingTranscript(state: OnboardingState) {
  const lines: { from: "assistant" | "user"; text: string; skipped?: boolean }[] = [{ from: "assistant", text: state.greeting }];
  const order: Step[] = ["assistant_name", "name", "business", "help", "style", "summary", "personality", "done"];
  const reached = order.indexOf(state.step);
  for (const question of state.questions) {
    if (order.indexOf(question.id) >= reached) break;
    lines.push({ from: "assistant", text: question.question });
    const answer = answerFor(state, question.id);
    if (answer === null) lines.push({ from: "user", text: "Skipped", skipped: true });
    else lines.push({ from: "user", text: answer });
  }
  return lines;
}

function answerFor(state: OnboardingState, question: Question) {
  if (question === "assistant_name") {
    if (state.assistant_name_given) return state.assistant_name;
    return null;
  }
  return state.about[question];
}
