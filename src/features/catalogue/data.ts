// MOCK DATA for the Catalogue prototype. Nothing here comes from the backend.
//
// The two "added" agents mirror the real agents in server/agents/ (name and
// description copied from operator.md and forecasting.md). Everything else is a
// placeholder: the Store agent does not exist yet, and every app is invented to
// show how the pages look with more than agents in them. The `app` blocks (connection,
// last synced, used by), prices, long descriptions and plugins are invented too.
//
// Plugins belong to a parent app: an entry with kind "plugin" names its parent in
// `parentId`, and that is the only place the relationship is written down. A parent's
// plugins are derived from it (services/plugins.ts); plugins never list on their own.
//
// Images live in public/catalogue/. The files shipped there are gradient placeholder
// PNGs: card images are agents 800×1000 (4:5 portrait) and apps 1200×900 (4:3
// landscape); detail-page previews are 1600×1000 (16:10) in public/catalogue/<id>/.
// Replace them with real artwork at the same size and keep the file names.

export type CatalogueType = "agent" | "app";
export type CatalogueStatus = "available" | "added" | "coming_soon";
export type AppConnection = "connected" | "needs_attention" | "not_connected";
/** App entries only: a standalone app, or a plugin that belongs to a parent app. */
export type AppKind = "app" | "plugin";

/** What My apps shows for an app once it is added. MOCK values, like the rest of this file. */
export type AppDetails = {
  connection: AppConnection;
  /** ISO time of the last sync, or null when it has never synced. */
  lastSynced: string | null;
  /** Ids of the agents that use this app; names come from the agent entries below. */
  usedBy: string[];
  /** Shown under "Needs attention": what is wrong and what to do. */
  attentionNote?: string;
};

/** Who published an entry. Entries refer to a publisher by id; the list is PUBLISHERS below. */
export type Publisher = {
  id: string;
  name: string;
  /** Square image under public/, shown at 16 px on cards and 32 px on the detail page. */
  avatar: string;
  /** Verified publishers get an "Official" badge on the detail page. */
  verified: boolean;
};

/** MOCK publishers. Every entry is Mula's for now; third-party publishers are added here. */
export const PUBLISHERS: Publisher[] = [
  { id: "mula", name: "Mula", avatar: "/catalogue/publishers/mula.png", verified: true },
];

/** One preview image for the detail page's carousel. */
export type Screenshot = { src: string; alt: string };

/** A price in a currency's main unit, such as { amount: 49000, currency: "IDR" }. 0 shows "Free". */
export type Price = { amount: number; currency: string };

export type CatalogueEntry = {
  id: string;
  name: string;
  type: CatalogueType;
  /** One sentence, shown under the name and cut off after two lines. Keep it under about 70 characters. */
  description: string;
  /** A few sentences for the detail page. */
  longDescription: string;
  status: CatalogueStatus;
  price: Price;
  /** Extra search words; not shown on the card. */
  tags: string[];
  /** Path under public/, such as "/catalogue/operator.png". */
  image: string;
  /** Describes the artwork for screen readers, not the entry. */
  imageAlt: string;
  /** 3–4 previews for the detail page, in public/catalogue/<id>/. */
  screenshots: Screenshot[];
  /** App entries only. Plugins are shown inside their parent, never as their own card. */
  kind?: AppKind;
  /** Plugins only (required for them): the id of the parent app. */
  parentId?: string;
  /** The id of the entry's publisher in PUBLISHERS. */
  publisher: string;
  /** Where "Open" goes. Entries without a page get a short notice instead. */
  href?: string;
  /**
   * Apps only: where the app opens, in a new tab. A path inside Mula ("/apps/todo") or a
   * full https URL for an external app. Every Open link for an added app is built from it
   * (services/launch.ts); apps without one have nothing to open yet.
   */
  launchUrl?: string;
  /** True for invented entries that have no real counterpart yet. */
  placeholder: boolean;
  /** App entries only: connection details for My apps. */
  app?: AppDetails;
};

const FREE: Price = { amount: 0, currency: "IDR" };

/** A mock "last synced" time this many minutes before the page loaded. */
function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

/** Preview images numbered 1.png, 2.png… in the entry's folder; each caption becomes its alt text. */
function previews(id: string, name: string, captions: string[]): Screenshot[] {
  return captions.map((caption, index) => ({ src: `/catalogue/${id}/${index + 1}.png`, alt: `${name}: ${caption}` }));
}

export const CATALOGUE_ENTRIES: CatalogueEntry[] = [
  {
    id: "operator",
    name: "Operator",
    type: "agent",
    description: "Your everyday partner for questions, planning and business context.",
    longDescription: "The Operator is your first stop for everyday questions. It plans next steps with you, reads the CSV files you attach, remembers facts about your business, and asks Forecasting for help when you need numbers.",
    status: "added",
    price: FREE,
    tags: ["chat", "planning", "questions", "memory", "csv"],
    image: "/catalogue/operator.png",
    imageAlt: "Portrait of the Operator agent",
    screenshots: previews("operator", "Operator", ["a conversation about this week's orders", "reading an attached CSV file", "saved facts on the Memory page"]),
    href: "/",
    publisher: "mula",
    placeholder: false,
  },
  {
    id: "forecasting",
    name: "Forecasting",
    type: "agent",
    description: "Turn a sales or demand history into a practical statistical forecast.",
    longDescription: "Forecasting turns a sales or demand history into a forecast using simple, proven statistical methods. It explains the result and its likely error in plain language, and never invents numbers.",
    status: "added",
    price: FREE,
    tags: ["forecast", "sales", "demand", "statistics", "csv"],
    image: "/catalogue/forecasting.png",
    imageAlt: "Portrait of the Forecasting agent",
    screenshots: previews("forecasting", "Forecasting", ["a forecast chart with history and prediction", "choosing a forecasting method", "a plain-language explanation of a result"]),
    href: "/agents",
    publisher: "mula",
    placeholder: false,
  },
  {
    id: "store",
    name: "Store",
    type: "agent",
    description: "Keeps an eye on your online store's orders, stock and listings.",
    longDescription: "The Store agent will watch your online store for you: new orders, items running low and listings that need fixing. It will tell you what needs doing first.",
    status: "coming_soon",
    price: FREE,
    tags: ["store", "orders", "stock", "listings", "marketplace", "tokopedia"],
    image: "/catalogue/store.png",
    imageAlt: "Portrait of the Store agent",
    screenshots: previews("store", "Store", ["today's orders at a glance", "items running low", "listings that need fixing"]),
    publisher: "mula",
    placeholder: true,
  },
  {
    id: "tokopedia-sync",
    kind: "app",
    name: "Store app",
    type: "app",
    description: "Bring your Tokopedia orders and stock levels into Mula.",
    longDescription: "Connect your Tokopedia shop so its orders and stock levels show up in Mula. Your agents can then answer questions about sales and stock without you copying anything across. Add its Store monitor and Store admin plugins to do more with it.",
    status: "available",
    price: FREE,
    tags: ["tokopedia", "marketplace", "orders", "stock", "sync", "ecommerce"],
    image: "/catalogue/tokopedia-sync.png",
    imageAlt: "Icon for the Store app",
    screenshots: previews("tokopedia-sync", "Store app", ["connecting a Tokopedia shop", "orders brought into Mula", "stock levels by product", "sync history"]),
    publisher: "mula",
    placeholder: true,
    app: { connection: "needs_attention", lastSynced: minutesAgo(26 * 60), usedBy: ["store"], attentionNote: "The Tokopedia sign-in expired. Reconnect to resume syncing." },
  },
  {
    id: "store-monitor",
    kind: "plugin",
    parentId: "tokopedia-sync",
    name: "Store monitor",
    type: "app",
    description: "Alerts you when orders wait too long or an item runs low.",
    longDescription: "A plugin for Store app. It watches your synced shop and alerts you when an order has waited too long or a product is about to run out.",
    status: "available",
    price: FREE,
    tags: ["alerts", "orders", "marketplace", "tokopedia", "plugin"],
    image: "/catalogue/store-monitor.png",
    imageAlt: "Icon for the Store monitor plugin",
    screenshots: previews("store-monitor", "Store monitor", ["an alert for a late order", "alert settings", "a weekly summary"]),
    publisher: "mula",
    placeholder: true,
    app: { connection: "connected", lastSynced: minutesAgo(40), usedBy: ["store"] },
  },
  {
    id: "store-admin",
    kind: "plugin",
    parentId: "tokopedia-sync",
    name: "Store admin",
    type: "app",
    description: "Edit your Tokopedia prices and listings without leaving Mula.",
    longDescription: "A plugin for Store app. Change prices, update product descriptions and pause listings from Mula, and see every change you made in one list.",
    status: "available",
    price: FREE,
    tags: ["listings", "prices", "products", "marketplace", "tokopedia", "plugin"],
    image: "/catalogue/store-admin.png",
    imageAlt: "Icon for the Store admin plugin",
    screenshots: previews("store-admin", "Store admin", ["editing a product price", "pausing a listing", "the list of recent changes"]),
    publisher: "mula",
    placeholder: true,
    app: { connection: "not_connected", lastSynced: null, usedBy: [] },
  },
  {
    id: "stock-sheet",
    kind: "app",
    name: "Stock sheet",
    type: "app",
    description: "Keep a simple stock list that your agents can read.",
    longDescription: "A plain stock list with item names, quantities and reorder levels. Your agents can read it to answer questions about what you have and what to reorder.",
    status: "available",
    price: FREE,
    tags: ["inventory", "stock", "spreadsheet", "csv"],
    image: "/catalogue/stock-sheet.png",
    imageAlt: "Icon for the Stock sheet app",
    screenshots: previews("stock-sheet", "Stock sheet", ["the stock list", "editing a quantity", "items below their reorder level"]),
    publisher: "mula",
    placeholder: true,
    app: { connection: "connected", lastSynced: minutesAgo(12), usedBy: ["operator", "store"] },
  },
  {
    id: "invoice-maker",
    kind: "app",
    name: "Invoice maker",
    type: "app",
    description: "Create simple invoices and see which ones are still unpaid.",
    longDescription: "Make a clean invoice in a minute, send it to a customer, and keep track of which invoices are paid and which are still waiting.",
    status: "available",
    price: FREE,
    tags: ["invoice", "billing", "payments", "finance"],
    image: "/catalogue/invoice-maker.png",
    imageAlt: "Icon for the Invoice maker app",
    screenshots: previews("invoice-maker", "Invoice maker", ["a new invoice", "the list of unpaid invoices", "an invoice ready to send"]),
    publisher: "mula",
    placeholder: true,
    app: { connection: "not_connected", lastSynced: null, usedBy: [] },
  },
  {
    id: "delivery-tracker",
    kind: "app",
    name: "Delivery tracker",
    type: "app",
    description: "Follow your parcels from pickup to doorstep in one list.",
    longDescription: "See every parcel you have sent in one list, with its courier and where it is now, so you can answer \"where is my order?\" quickly.",
    status: "coming_soon",
    price: FREE,
    tags: ["delivery", "shipping", "logistics", "courier", "parcels"],
    image: "/catalogue/delivery-tracker.png",
    imageAlt: "Icon for the Delivery tracker app",
    screenshots: previews("delivery-tracker", "Delivery tracker", ["parcels on their way", "one parcel's journey", "parcels delivered today"]),
    publisher: "mula",
    placeholder: true,
    app: { connection: "not_connected", lastSynced: null, usedBy: ["store"] },
  },
  {
    id: "shop-website",
    kind: "app",
    name: "Shop website",
    type: "app",
    description: "A simple storefront page for your products and contact details.",
    longDescription: "A one-page website for your shop with your products, opening hours and contact details. Change it any time without needing a web designer.",
    status: "available",
    price: FREE,
    tags: ["website", "storefront", "shop", "online", "products"],
    image: "/catalogue/shop-website.png",
    imageAlt: "Preview of the Shop website",
    screenshots: previews("shop-website", "Shop website", ["the storefront page", "editing a product", "the contact section"]),
    publisher: "mula",
    placeholder: true,
    app: { connection: "connected", lastSynced: minutesAgo(2 * 24 * 60), usedBy: [] },
  },
  {
    id: "todo",
    kind: "app",
    name: "To-do",
    type: "app",
    description: "A simple task list for daily shop chores.",
    longDescription: "Keep the day's chores in one short list: opening tasks, restocking, deliveries to check. Tick things off as you go and see what is left before closing.",
    status: "available",
    price: FREE,
    tags: ["tasks", "todo", "checklist", "chores", "daily"],
    image: "/catalogue/todo.png",
    imageAlt: "Icon for the To-do app",
    screenshots: previews("todo", "To-do", ["today's task list", "adding a task", "ticking off a finished task", "tasks left before closing"]),
    publisher: "mula",
    // A working prototype at /apps/todo (src/features/apps/todo/), not just a listing.
    launchUrl: "/apps/todo",
    placeholder: false,
    // A task list has nothing external to connect to, so it is simply connected.
    app: { connection: "connected", lastSynced: minutesAgo(5), usedBy: [] },
  },
];
