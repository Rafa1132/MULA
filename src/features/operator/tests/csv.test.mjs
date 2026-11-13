import assert from "node:assert/strict";
import test from "node:test";
import { readCsvFile } from "../services/csv.ts";

test("CSV reading preserves UTF-8 text, quotes and newlines", async () => {
  const text = 'name,amount\n"Kopi, susu",20\n茶,30\n';
  const result = await readCsvFile(new File([text], "sales.csv"));
  assert.deepEqual(result, { name: "sales.csv", content: text });
});

test("rejects wrong types, empty files, oversize files and invalid UTF-8", async () => {
  for (const file of [new File(["text"], "report.pdf"), new File([], "empty.csv"),
    new File(["a".repeat(50001)], "large.csv"), new File([new Uint8Array([255, 254])], "invalid.csv")]) {
    await assert.rejects(readCsvFile(file));
  }
});
