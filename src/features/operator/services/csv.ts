export type CsvFile = { name: string; content: string };
export const MAX_CSV_BYTES = 50_000;

export async function readCsvFile(file: File): Promise<CsvFile> {
  if (!file.name.toLowerCase().endsWith(".csv")) throw new Error("Please attach a .csv file.");
  if (file.name.length > 120) throw new Error("Use a CSV filename of at most 120 characters.");
  if (file.size === 0) throw new Error("This CSV is empty.");
  if (file.size > MAX_CSV_BYTES) throw new Error("CSV files must be 50 KB or smaller.");
  const bytes = await file.arrayBuffer();
  let content: string;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Export this CSV as UTF-8 text and attach it again.");
  }
  return { name: file.name, content };
}
