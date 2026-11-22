// The project's knowledge base (server/src/features/knowledge): the only facts Customer Service may
// answer customers from.

export type KnowledgeKind = "faq" | "product" | "hours" | "policy";

export type KnowledgeEntry = {
  id: string;
  kind: KnowledgeKind;
  title: string;
  body: string;
  // Products and services only; free text such as "Rp 25.000".
  price: string;
  updated_at: number;
};

export type EntryDraft = Pick<KnowledgeEntry, "kind" | "title" | "body" | "price">;

export type EntryErrors = Partial<Record<keyof EntryDraft, string>>;
