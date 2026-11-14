// MOCK DATA for the Catalogue prototype. Nothing here comes from the backend, and
// adding an entry on the page is not saved anywhere.
//
// The two "added" agents mirror the real agents in server/agents/ (name and
// description copied from operator.md and forecasting.md). Everything else is a
// placeholder: the Store agent does not exist yet, and every app is invented to
// show how the page looks with more than agents in it.
//
// Images live in public/catalogue/. The files shipped there are gradient placeholder
// PNGs: agents 800×1000 (4:5 portrait), apps 1200×900 (4:3 landscape). Replace them
// with real artwork at the same size and keep the file names.

export type CatalogueType = "agent" | "app";
export type CatalogueStatus = "available" | "added" | "coming_soon";

export type CatalogueEntry = {
  id: string;
  name: string;
  type: CatalogueType;
  /** One sentence, shown under the name and cut off after two lines. Keep it under about 70 characters. */
  description: string;
  status: CatalogueStatus;
  /** Extra search words; not shown on the card. */
  tags: string[];
  /** Path under public/, such as "/catalogue/operator.png". */
  image: string;
  /** Describes the artwork for screen readers, not the entry. */
  imageAlt: string;
  /** Where "Open" goes. Entries without a page get a short notice instead. */
  href?: string;
  /** True for invented entries that have no real counterpart yet. */
  placeholder: boolean;
};

export const CATALOGUE_ENTRIES: CatalogueEntry[] = [
  {
    id: "operator",
    name: "Operator",
    type: "agent",
    description: "Your everyday partner for questions, planning and business context.",
    status: "added",
    tags: ["chat", "planning", "questions", "memory", "csv"],
    image: "/catalogue/operator.png",
    imageAlt: "Portrait of the Operator agent",
    href: "/",
    placeholder: false,
  },
  {
    id: "forecasting",
    name: "Forecasting",
    type: "agent",
    description: "Turn a sales or demand history into a practical statistical forecast.",
    status: "added",
    tags: ["forecast", "sales", "demand", "statistics", "csv"],
    image: "/catalogue/forecasting.png",
    imageAlt: "Portrait of the Forecasting agent",
    href: "/agents",
    placeholder: false,
  },
  {
    id: "store",
    name: "Store",
    type: "agent",
    description: "Keeps an eye on your online store's orders, stock and listings.",
    status: "coming_soon",
    tags: ["store", "orders", "stock", "listings", "marketplace", "tokopedia"],
    image: "/catalogue/store.png",
    imageAlt: "Portrait of the Store agent",
    placeholder: true,
  },
  {
    id: "tokopedia-sync",
    name: "Tokopedia store sync",
    type: "app",
    description: "Bring your Tokopedia orders and stock levels into Mula.",
    status: "available",
    tags: ["tokopedia", "marketplace", "orders", "stock", "sync", "ecommerce"],
    image: "/catalogue/tokopedia-sync.png",
    imageAlt: "Icon for the Tokopedia store sync app",
    placeholder: true,
  },
  {
    id: "stock-sheet",
    name: "Stock sheet",
    type: "app",
    description: "Keep a simple stock list that your agents can read.",
    status: "available",
    tags: ["inventory", "stock", "spreadsheet", "csv"],
    image: "/catalogue/stock-sheet.png",
    imageAlt: "Icon for the Stock sheet app",
    placeholder: true,
  },
  {
    id: "invoice-maker",
    name: "Invoice maker",
    type: "app",
    description: "Create simple invoices and see which ones are still unpaid.",
    status: "available",
    tags: ["invoice", "billing", "payments", "finance"],
    image: "/catalogue/invoice-maker.png",
    imageAlt: "Icon for the Invoice maker app",
    placeholder: true,
  },
  {
    id: "delivery-tracker",
    name: "Delivery tracker",
    type: "app",
    description: "Follow your parcels from pickup to doorstep in one list.",
    status: "coming_soon",
    tags: ["delivery", "shipping", "logistics", "courier", "parcels"],
    image: "/catalogue/delivery-tracker.png",
    imageAlt: "Icon for the Delivery tracker app",
    placeholder: true,
  },
];
