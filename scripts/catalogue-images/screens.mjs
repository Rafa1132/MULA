// Detail-page previews (1600×1000): believable mock UI for each entry, one function per
// caption in data.ts. All shops, people and products are invented sample data; no real
// brands, logos or store names. Each screen carries a "Contoh data" (sample data) tag.
import {
  PALETTE as P, ICONS, appFrame, pick, barChart, button, card, chip, circle, field, icon, line, lineChart, path, rect, rupiah, statusCell, table, text,
} from "./kit.mjs";

// Invented products for a small Indonesian grocery and snack shop.
const PRODUCTS = [
  { name: "Keripik Singkong Pedas 200 g", price: 18000, stock: 42, sold: 128 },
  { name: "Sambal Bawang Botol 150 ml", price: 25000, stock: 6, sold: 97 },
  { name: "Kopi Robusta Bubuk 250 g", price: 42000, stock: 19, sold: 74 },
  { name: "Gula Aren Cair 500 ml", price: 35000, stock: 3, sold: 61 },
  { name: "Kerupuk Udang 250 g", price: 22500, stock: 55, sold: 58 },
  { name: "Teh Melati Celup isi 25", price: 12000, stock: 8, sold: 49 },
  { name: "Beras Pandan Wangi 5 kg", price: 78000, stock: 14, sold: 33 },
  { name: "Minyak Kelapa 1 L", price: 31000, stock: 27, sold: 29 },
];
const CUSTOMERS = ["Bu Rina", "Pak Joko", "Mbak Sari", "Mas Dimas", "Bu Wati", "Pak Hendra"];
const WEEK = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

const ACCENTS = {
  operator: P.ember, forecasting: P.gold, store: P.ember, "tokopedia-sync": P.ember, "store-monitor": P.gold,
  "store-admin": P.night, "stock-sheet": P.gold, "invoice-maker": P.ember, "delivery-tracker": P.night, "shop-website": P.ember, todo: P.ember,
};

function heading(box, title, subtitle) {
  return text(box.x, box.y + 30, title, { size: 36, weight: 700 }) + text(box.x, box.y + 66, subtitle, { size: 19, fill: P.quiet });
}

function statCard(x, y, width, label, value, note, tone = P.quiet) {
  return card(x, y, width, 130) + text(x + 24, y + 40, label, { size: 16, weight: 600, fill: P.quiet })
    + text(x + 24, y + 86, value, { size: 34, weight: 700 }) + text(x + 24, y + 114, note, { size: 15, weight: 600, fill: tone });
}

/** A chat bubble; `from` is "agent" or "user". Returns markup and its height. */
function bubble(x, y, width, lines, from) {
  const height = lines.length * 30 + 34;
  let fill = P.white;
  let color = P.night;
  let bx = x;
  if (from === "user") { fill = P.night; color = P.bone; bx = x + (900 - width); }
  let out = rect(bx, y, width, height, fill, { r: 20, stroke: P.line, strokeWidth: pick(from === "user", 0, 1.5) });
  lines.forEach((value, index) => { out += text(bx + 24, y + 42 + index * 30, value, { size: 19, fill: color }); });
  return { markup: out, height };
}

function chat(box, messages) {
  let out = "";
  let y = box.y;
  for (const [from, width, lines] of messages) {
    const b = bubble(box.x, y, width, lines, from);
    out += b.markup;
    y += b.height + 22;
  }
  return out;
}

function composer(box, placeholder) {
  const y = box.y + box.height - 66;
  return rect(box.x, y, box.width, 66, P.white, { r: 33, stroke: P.line, strokeWidth: 1.5 })
    + text(box.x + 30, y + 41, placeholder, { size: 19, fill: P.quiet })
    + circle(box.x + box.width - 33, y + 33, 24, P.ember) + icon(box.x + box.width - 45, y + 21, 24, ICONS.send, P.night);
}

function frame(id, name, nav, body) {
  return appFrame(name, ACCENTS[id], body, { nav });
}

const SCREENS = {
  operator: [
    () => frame("operator", "Operator", ["Chat", "Memory"], (box) => {
      const width = 980;
      const inner = { ...box, width, x: box.x + 160 };
      return chat(inner, [
        ["user", 560, ["Berapa pesanan minggu ini dibanding minggu lalu?"]],
        ["agent", 780, ["Minggu ini ada 86 pesanan, naik 12% dari minggu lalu (77).", "Paling laku: Keripik Singkong Pedas (31) dan Sambal Bawang (24).", "Sabtu jadi hari tersibuk dengan 21 pesanan."]],
        ["user", 470, ["Ada yang perlu saya perhatikan?"]],
        ["agent", 800, ["Stok Gula Aren Cair tinggal 3 dan biasanya habis dalam 2 hari.", "Mau saya buatkan pengingat untuk pesan ulang besok pagi?"]],
      ]) + composer(inner, "Tanya Operator…");
    }),
    () => frame("operator", "Operator", ["Chat", "Memory"], (box) => {
      const inner = { ...box, width: 980, x: box.x + 160 };
      let out = rect(inner.x + 900 - 380, inner.y, 380, 74, P.white, { r: 16, stroke: P.line, strokeWidth: 1.5 })
        + rect(inner.x + 900 - 362, inner.y + 16, 42, 42, P.goldSoft, { r: 10 }) + icon(inner.x + 900 - 353, inner.y + 25, 24, ICONS.file, "#8A5A00")
        + text(inner.x + 900 - 304, inner.y + 34, "penjualan-oktober.csv", { size: 18, weight: 600 }) + text(inner.x + 900 - 304, inner.y + 58, "412 baris · 18 KB", { size: 15, fill: P.quiet });
      out += bubble(inner.x, inner.y + 96, 900, ["Saya sudah membaca file-nya: 412 transaksi selama Oktober.", "Total penjualan Rp 14.860.000. Ringkasan per produk:"], "agent").markup;
      out += card(inner.x, inner.y + 230, 900, 330);
      out += table(inner.x + 30, inner.y + 280, 840, [0, 430, 600, 730], ["PRODUK", "TERJUAL", "PENDAPATAN", "TREN"],
        PRODUCTS.slice(0, 4).map((p, i) => [p.name, String(p.sold), rupiah(p.sold * p.price), statusCell(["Naik", "Naik", "Stabil", "Turun"][i], ["ok", "ok", "quiet", "warn"][i])]));
      return out + composer(inner, "Tanya tentang file ini…");
    }),
    () => frame("operator", "Operator", ["Memory", "Chat"], (box) => {
      let out = heading(box, "Yang Operator ingat", "Fakta yang Anda simpan. Operator memakainya saat menjawab.");
      const facts = [
        ["Toko buka jam 07.00–21.00, tutup hari Jumat siang.", "Disimpan 3 Nov"],
        ["Pemasok gula aren: CV Manis Lestari, pesan minimal 24 botol.", "Disimpan 5 Nov"],
        ["Ongkir gratis untuk pesanan di atas Rp 150.000.", "Disimpan 8 Nov"],
        ["Mbak Sari mengurus pengiriman setiap Selasa dan Kamis.", "Disimpan 10 Nov"],
        ["Target penjualan November: Rp 18.000.000.", "Disimpan 12 Nov"],
      ];
      facts.forEach(([fact, when], i) => {
        const y = box.y + 110 + i * 112;
        out += card(box.x, y, box.width, 92) + circle(box.x + 44, y + 46, 16, P.emberSoft) + icon(box.x + 34, y + 36, 20, ICONS.check, P.emberText)
          + text(box.x + 80, y + 54, fact, { size: 21, weight: 500 }) + text(box.x + box.width - 30, y + 54, when, { size: 16, fill: P.quiet, anchor: "end" });
      });
      return out;
    }),
  ],
  forecasting: [
    () => frame("forecasting", "Forecasting", ["Ramalan", "Riwayat"], (box) => {
      let out = heading(box, "Ramalan penjualan 4 minggu", "Keripik Singkong Pedas 200 g · per minggu");
      out += card(box.x, box.y + 100, box.width, 480);
      const values = [96, 104, 99, 112, 118, 109, 121, 127, 124, 133, 138, 131, 140, 146, 150, 157];
      out += lineChart(box.x + 70, box.y + 140, box.width - 140, 330, values, { dashFrom: 11, band: true });
      out += line(box.x + 70, box.y + 520, box.x + 110, box.y + 520, P.night, 4) + text(box.x + 122, box.y + 527, "Riwayat", { size: 17 });
      out += `<line x1="${box.x + 240}" y1="${box.y + 520}" x2="${box.x + 280}" y2="${box.y + 520}" stroke="${P.ember}" stroke-width="4" stroke-dasharray="10 9"/>` + text(box.x + 292, box.y + 527, "Ramalan", { size: 17 });
      out += rect(box.x + 410, box.y + 510, 40, 18, P.goldSoft) + text(box.x + 462, box.y + 527, "Rentang kemungkinan", { size: 17 });
      out += statCard(box.x, box.y + 600, 420, "Minggu depan", "140–152", "pcs, perkiraan", P.green)
        + statCard(box.x + 450, box.y + 600, 420, "Metode", "Holt", "tren naik terdeteksi")
        + statCard(box.x + 900, box.y + 600, box.width - 900, "Saran stok", "160 pcs", "untuk 1 minggu + cadangan", P.emberText);
      return out;
    }),
    () => frame("forecasting", "Forecasting", ["Ramalan", "Riwayat"], (box) => {
      let out = heading(box, "Pilih metode", "Forecasting menyarankan metode yang cocok dengan data Anda.");
      const methods = [
        ["Otomatis (disarankan)", "Mencoba beberapa metode dan memilih yang paling akurat.", true],
        ["Rata-rata bergerak", "Cocok untuk penjualan yang stabil tanpa tren.", false],
        ["Holt (tren)", "Untuk penjualan yang naik atau turun pelan-pelan.", false],
        ["Holt-Winters (musiman)", "Untuk pola mingguan atau menjelang Lebaran.", false],
      ];
      methods.forEach(([name, note, chosen], i) => {
        const y = box.y + 110 + i * 130;
        let stroke = P.line;
        let strokeWidth = 1.5;
        if (chosen) { stroke = P.ember; strokeWidth = 3; }
        out += rect(box.x, y, 860, 110, P.white, { r: 18, stroke, strokeWidth })
          + circle(box.x + 50, y + 55, 16, "none", { stroke: P.night, strokeWidth: 3 });
        if (chosen) out += circle(box.x + 50, y + 55, 8, P.ember);
        out += text(box.x + 90, y + 48, name, { size: 23, weight: 700 }) + text(box.x + 90, y + 80, note, { size: 18, fill: P.quiet });
      });
      out += card(box.x + 900, box.y + 110, box.width - 900, 500)
        + text(box.x + 930, box.y + 160, "Data Anda", { size: 22, weight: 700 })
        + [["Riwayat", "16 minggu"], ["Pola", "Tren naik"], ["Musiman", "Tidak terlihat"], ["Data kosong", "0 minggu"]].map(([k, v], i) => text(box.x + 930, box.y + 220 + i * 56, k, { size: 18, fill: P.quiet }) + text(box.x + box.width - 30, box.y + 220 + i * 56, v, { size: 18, weight: 600, anchor: "end" })).join("")
        + barChart(box.x + 930, box.y + 440, box.width - 960, 130, [96, 104, 99, 112, 118, 109, 121, 127, 124, 133, 138, 131], { color: P.night });
      out += button(box.x, box.y + 660, "Buat ramalan").markup;
      return out;
    }),
    () => frame("forecasting", "Forecasting", ["Ramalan", "Riwayat"], (box) => {
      let out = heading(box, "Penjelasan", "Hasil ramalan dalam bahasa sehari-hari.");
      out += card(box.x, box.y + 100, 900, 600);
      const lines = [
        "Penjualan Keripik Singkong Pedas naik pelan tapi stabil,",
        "rata-rata sekitar 4 bungkus lebih banyak setiap minggu.",
        "",
        "Untuk minggu depan, kemungkinan besar terjual 140 sampai",
        "152 bungkus. Angka di tengahnya, 146, paling mungkin.",
        "",
        "Stok sekarang 42 bungkus, jadi cukup untuk sekitar dua",
        "hari. Pesan ulang paling lambat Rabu supaya tidak kosong",
        "di akhir pekan, saat penjualan biasanya paling tinggi.",
      ];
      lines.forEach((value, i) => { out += text(box.x + 40, box.y + 170 + i * 46, value, { size: 23 }); });
      out += card(box.x + 940, box.y + 100, box.width - 940, 280) + icon(box.x + 970, box.y + 130, 34, ICONS.warn, P.emberText)
        + text(box.x + 970, box.y + 210, "Perlu diingat", { size: 22, weight: 700 })
        + text(box.x + 970, box.y + 250, "Ramalan ini tidak tahu tentang", { size: 18, fill: P.quiet })
        + text(box.x + 970, box.y + 278, "promo atau hari libur yang akan", { size: 18, fill: P.quiet })
        + text(box.x + 970, box.y + 306, "datang.", { size: 18, fill: P.quiet });
      out += card(box.x + 940, box.y + 410, box.width - 940, 290) + text(box.x + 970, box.y + 460, "Keyakinan", { size: 22, weight: 700 })
        + rect(box.x + 970, box.y + 500, box.width - 1000, 22, P.bone, { r: 11 }) + rect(box.x + 970, box.y + 500, (box.width - 1000) * 0.78, 22, P.gold, { r: 11 })
        + text(box.x + 970, box.y + 560, "Cukup tinggi · 16 minggu data", { size: 18, fill: P.quiet });
      return out;
    }),
  ],
  store: [
    () => frame("store", "Store", ["Hari ini", "Stok", "Listing"], (box) => {
      let out = heading(box, "Pesanan hari ini", "Selasa, 17 November");
      out += statCard(box.x, box.y + 100, 300, "Pesanan baru", "14", "+3 dari kemarin", P.green)
        + statCard(box.x + 330, box.y + 100, 300, "Perlu dikirim", "6", "sebelum jam 15.00", P.emberText)
        + statCard(box.x + 660, box.y + 100, 300, "Pendapatan", rupiah(1284000), "hari ini")
        + statCard(box.x + 990, box.y + 100, box.width - 990, "Terlambat", "1", "lebih dari 24 jam", P.emberText);
      out += card(box.x, box.y + 260, box.width, 470);
      out += table(box.x + 30, box.y + 310, box.width - 60, [0, 200, 640, 860, 1060], ["NO.", "PRODUK", "PEMBELI", "TOTAL", "STATUS"],
        [["#2041", PRODUCTS[0].name, CUSTOMERS[0], rupiah(54000), statusCell("Dikemas", "gold")],
          ["#2040", PRODUCTS[2].name, CUSTOMERS[1], rupiah(42000), statusCell("Baru", "quiet")],
          ["#2039", PRODUCTS[1].name, CUSTOMERS[2], rupiah(75000), statusCell("Dikirim", "ok")],
          ["#2038", PRODUCTS[6].name, CUSTOMERS[3], rupiah(78000), statusCell("Terlambat", "warn")],
          ["#2037", PRODUCTS[4].name, CUSTOMERS[4], rupiah(45000), statusCell("Dikirim", "ok")],
          ["#2036", PRODUCTS[5].name, CUSTOMERS[5], rupiah(24000), statusCell("Dikirim", "ok")]], { rowHeight: 66 });
      return out;
    }),
    () => frame("store", "Store", ["Stok", "Hari ini", "Listing"], (box) => {
      let out = heading(box, "Stok menipis", "Barang yang akan habis dalam 3 hari, menurut penjualan rata-rata.");
      const low = [PRODUCTS[3], PRODUCTS[1], PRODUCTS[5], PRODUCTS[6]];
      low.forEach((p, i) => {
        const y = box.y + 110 + i * 150;
        const days = [1, 2, 2, 3][i];
        out += card(box.x, y, box.width, 130) + rect(box.x + 24, y + 24, 82, 82, [P.goldSoft, P.emberSoft, P.bone, P.goldSoft][i], { r: 16 }) + icon(box.x + 45, y + 45, 40, ICONS.box, P.night)
          + text(box.x + 130, y + 56, p.name, { size: 24, weight: 700 }) + text(box.x + 130, y + 92, `Sisa ${p.stock} · terjual rata-rata ${Math.round(p.sold / 30)} per hari`, { size: 18, fill: P.quiet })
          + chip(box.x + box.width - 470, y + 46, `Habis dalam ${days} hari`, { fill: P.emberSoft, color: P.emberText, size: 17, weight: 700 }).markup
          + button(box.x + box.width - 200, y + 42, "Pesan ulang", { primary: i === 0 }).markup;
      });
      return out;
    }),
    () => frame("store", "Store", ["Listing", "Hari ini", "Stok"], (box) => {
      let out = heading(box, "Listing yang perlu diperbaiki", "4 masalah ditemukan di toko online Anda.");
      const issues = [
        [PRODUCTS[2].name, "Foto produk buram atau terlalu kecil", "Ganti foto"],
        [PRODUCTS[7].name, "Deskripsi kurang dari 30 kata", "Tulis ulang"],
        [PRODUCTS[4].name, "Berat tidak diisi, ongkir bisa salah", "Isi berat"],
        [PRODUCTS[5].name, "Harga berbeda dengan di toko fisik", "Samakan harga"],
      ];
      issues.forEach(([name, problem, action], i) => {
        const y = box.y + 110 + i * 150;
        out += card(box.x, y, box.width, 130) + circle(box.x + 60, y + 65, 30, P.emberSoft) + icon(box.x + 44, y + 49, 32, ICONS.warn, P.emberText)
          + text(box.x + 120, y + 56, name, { size: 24, weight: 700 }) + text(box.x + 120, y + 92, problem, { size: 19, fill: P.quiet })
          + button(box.x + box.width - 230, y + 42, action, { primary: false }).markup;
      });
      return out;
    }),
  ],
  "tokopedia-sync": [
    () => frame("tokopedia-sync", "Store app", ["Hubungkan", "Ringkasan", "Stok", "Riwayat"], (box) => {
      let out = heading(box, "Hubungkan toko online Anda", "Pesanan dan stok dari marketplace akan masuk ke Mula secara otomatis.");
      const steps = ["Pilih marketplace", "Masuk ke akun penjual", "Pilih yang disinkronkan"];
      steps.forEach((label, i) => {
        const x = box.x + i * 380;
        let fill = P.bone;
        let color = P.night;
        if (i <= 1) { fill = P.night; color = P.bone; }
        out += circle(x + 24, box.y + 140, 24, fill) + text(x + 24, box.y + 148, String(i + 1), { size: 20, weight: 700, fill: color, anchor: "middle" })
          + text(x + 62, box.y + 148, label, { size: 20, weight: pick(i === 1, 700, 500) });
        if (i < 2) out += line(x + 300, box.y + 140, x + 360, box.y + 140, P.line, 3);
      });
      out += card(box.x + 220, box.y + 210, 1000, 470);
      out += text(box.x + 270, box.y + 270, "Masuk ke akun penjual", { size: 28, weight: 700 });
      out += field(box.x + 270, box.y + 330, 900, "Nama toko di marketplace", "Toko Sinar Pagi");
      out += field(box.x + 270, box.y + 430, 900, "Email penjual", "sinarpagi.toko@contoh.id", { focused: true });
      out += rect(box.x + 270, box.y + 530, 26, 26, P.ember, { r: 6 }) + icon(box.x + 272, box.y + 532, 22, ICONS.check, P.night, 3)
        + text(box.x + 310, box.y + 551, "Sinkronkan pesanan dan stok setiap 15 menit", { size: 19 });
      out += button(box.x + 270, box.y + 600, "Hubungkan toko").markup + button(box.x + 470, box.y + 600, "Batal", { primary: false }).markup;
      return out;
    }),
    () => frame("tokopedia-sync", "Store app", ["Ringkasan", "Stok", "Riwayat"], (box) => {
      let out = heading(box, "Ringkasan penjualan", "7 hari terakhir · dari toko online");
      out += statCard(box.x, box.y + 100, 340, "Penjualan", rupiah(8420000), "+12% dari minggu lalu", P.green)
        + statCard(box.x + 370, box.y + 100, 340, "Pesanan", "86", "rata-rata 12 per hari")
        + statCard(box.x + 740, box.y + 100, box.width - 740, "Rata-rata per pesanan", rupiah(97900), "naik Rp 4.200", P.green);
      out += card(box.x, box.y + 260, 760, 480) + text(box.x + 30, box.y + 310, "Penjualan harian", { size: 22, weight: 700 })
        + barChart(box.x + 40, box.y + 350, 680, 320, [920, 1040, 860, 1180, 1320, 1690, 1410], { labels: WEEK });
      out += card(box.x + 790, box.y + 260, box.width - 790, 480) + text(box.x + 820, box.y + 310, "Produk terlaris", { size: 22, weight: 700 });
      PRODUCTS.slice(0, 6).forEach((p, i) => {
        const y = box.y + 350 + i * 62;
        out += rect(box.x + 820, y, 44, 44, [P.emberSoft, P.goldSoft, P.bone][i % 3], { r: 10 }) + text(box.x + 842, y + 29, String(i + 1), { size: 18, weight: 700, anchor: "middle" })
          + text(box.x + 884, y + 22, p.name, { size: 18, weight: 600 }) + text(box.x + 884, y + 44, `${p.sold} terjual`, { size: 15, fill: P.quiet })
          + text(box.x + box.width - 30, y + 30, rupiah(p.price), { size: 18, weight: 600, anchor: "end" });
      });
      return out;
    }),
    () => frame("tokopedia-sync", "Store app", ["Stok", "Ringkasan", "Riwayat"], (box) => {
      let out = heading(box, "Stok per produk", "Disamakan dengan toko online 4 menit lalu");
      out += card(box.x, box.y + 100, box.width, 640);
      PRODUCTS.forEach((p, i) => {
        const y = box.y + 150 + i * 72;
        const share = Math.min(p.stock / 60, 1);
        let fill = P.night;
        if (p.stock < 10) fill = P.ember;
        out += text(box.x + 30, y + 26, p.name, { size: 19, weight: 600 })
          + rect(box.x + 460, y + 8, 700, 26, P.bone, { r: 13 }) + rect(box.x + 460, y + 8, Math.max(700 * share, 26), 26, fill, { r: 13 })
          + text(box.x + 1190, y + 28, `${p.stock} pcs`, { size: 19, weight: 600 });
        if (p.stock < 10) out += statusCell("Menipis", "warn").draw(box.x + 1290, y + 21);
      });
      return out;
    }),
    () => frame("tokopedia-sync", "Store app", ["Riwayat", "Ringkasan", "Stok"], (box) => {
      let out = heading(box, "Riwayat sinkronisasi", "Setiap 15 menit, otomatis");
      out += card(box.x, box.y + 100, box.width, 640);
      const rows = [
        ["17 Nov, 10.45", "3 pesanan baru, 5 stok diperbarui", statusCell("Berhasil", "ok")],
        ["17 Nov, 10.30", "1 pesanan baru", statusCell("Berhasil", "ok")],
        ["17 Nov, 10.15", "Tidak ada perubahan", statusCell("Berhasil", "ok")],
        ["17 Nov, 10.00", "Masuk ulang diperlukan", statusCell("Perlu tindakan", "warn")],
        ["17 Nov, 09.45", "2 pesanan baru, 2 stok diperbarui", statusCell("Berhasil", "ok")],
        ["17 Nov, 09.30", "Koneksi lambat, dicoba lagi", statusCell("Diulang", "gold")],
        ["17 Nov, 09.15", "4 pesanan baru", statusCell("Berhasil", "ok")],
      ];
      out += table(box.x + 30, box.y + 150, box.width - 60, [0, 300, 1020], ["WAKTU", "PERUBAHAN", "HASIL"], rows, { rowHeight: 76, highlight: (row) => pick(row[2] === rows[3][2], P.emberSoft, null) });
      return out;
    }),
  ],
  "store-monitor": [
    () => frame("store-monitor", "Store monitor", ["Peringatan", "Pengaturan", "Ringkasan"], (box) => {
      let out = heading(box, "Peringatan", "5 baru hari ini");
      const alerts = [
        [ICONS.clock, P.emberSoft, P.emberText, "Pesanan #2038 belum dikirim", "Dipesan Pak Joko 26 jam lalu. Batas kirim hari ini jam 15.00.", "Mendesak"],
        [ICONS.box, P.emberSoft, P.emberText, "Stok Gula Aren Cair tinggal 3", "Biasanya habis dalam 2 hari. Pesan ulang ke pemasok?", "Stok"],
        [ICONS.tag, P.goldSoft, "#8A5A00", "Harga Kopi Robusta berubah", "Rp 42.000 → Rp 39.000 di toko online. Disengaja?", "Harga"],
        [ICONS.box, P.emberSoft, P.emberText, "Stok Sambal Bawang tinggal 6", "Terjual 3 per hari minggu ini.", "Stok"],
        [ICONS.tag, P.goldSoft, "#8A5A00", "Harga Teh Melati berbeda", "Rp 12.000 di toko, Rp 13.500 di toko online.", "Harga"],
      ];
      alerts.forEach(([glyph, fill, color, title, detail, tag], i) => {
        const y = box.y + 100 + i * 128;
        out += card(box.x, y, box.width, 110) + circle(box.x + 58, y + 55, 30, fill) + icon(box.x + 42, y + 39, 32, glyph, color)
          + text(box.x + 112, y + 46, title, { size: 23, weight: 700 }) + text(box.x + 112, y + 80, detail, { size: 18, fill: P.quiet })
          + chip(box.x + box.width - 330, y + 36, tag, { fill, color, size: 16, weight: 700 }).markup + button(box.x + box.width - 190, y + 32, "Lihat", { primary: false }).markup;
      });
      return out;
    }),
    () => frame("store-monitor", "Store monitor", ["Pengaturan", "Peringatan", "Ringkasan"], (box) => {
      let out = heading(box, "Pengaturan peringatan", "Pilih kapan Store monitor memberi tahu Anda.");
      const settings = [
        ["Pesanan belum dikirim", "Beri tahu setelah", "24 jam", true],
        ["Stok menipis", "Saat stok habis dalam", "3 hari", true],
        ["Harga berubah di toko online", "Untuk perubahan lebih dari", "5%", true],
        ["Ulasan bintang 1–2", "Segera", "", false],
      ];
      settings.forEach(([name, rule, value, on], i) => {
        const y = box.y + 100 + i * 140;
        out += card(box.x, y, 1000, 120) + text(box.x + 30, y + 52, name, { size: 23, weight: 700 }) + text(box.x + 30, y + 88, rule, { size: 18, fill: P.quiet });
        if (value) out += rect(box.x + 30 + rule.length * 9.5 + 12, y + 66, 110, 32, P.bone, { r: 8 }) + text(box.x + 30 + rule.length * 9.5 + 67, y + 89, value, { size: 18, weight: 700, anchor: "middle" });
        let track = P.line;
        let knob = 922;
        if (on) { track = P.ember; knob = 952; }
        out += rect(box.x + 900, y + 44, 70, 36, track, { r: 18 }) + circle(box.x + knob, y + 62, 14, P.white);
      });
      out += card(box.x + 1040, box.y + 100, box.width - 1040, 400) + text(box.x + 1070, box.y + 150, "Kirim ke", { size: 22, weight: 700 })
        + [["Aplikasi Mula", true], ["Email", true], ["SMS", false]].map(([label, on], i) => rect(box.x + 1070, box.y + 190 + i * 60, 28, 28, pick(on, P.ember, P.white), { r: 7, stroke: P.night, strokeWidth: pick(on, 0, 2) }) + pick(on, icon(box.x + 1072, box.y + 192 + i * 60, 24, ICONS.check, P.night, 3), "") + text(box.x + 1114, box.y + 212 + i * 60, label, { size: 19 })).join("")
        + button(box.x + 1070, box.y + 400, "Simpan").markup;
      return out;
    }),
    () => frame("store-monitor", "Store monitor", ["Ringkasan", "Peringatan", "Pengaturan"], (box) => {
      let out = heading(box, "Ringkasan mingguan", "10–16 November");
      out += statCard(box.x, box.y + 100, 330, "Peringatan", "23", "7 lebih sedikit", P.green)
        + statCard(box.x + 360, box.y + 100, 330, "Terlambat kirim", "2", "dari 86 pesanan", P.emberText)
        + statCard(box.x + 720, box.y + 100, 330, "Stok habis", "1 kali", "Gula Aren, 1 hari")
        + statCard(box.x + 1080, box.y + 100, box.width - 1080, "Perubahan harga", "4", "semua disengaja");
      out += card(box.x, box.y + 260, 800, 470) + text(box.x + 30, box.y + 310, "Peringatan per hari", { size: 22, weight: 700 })
        + barChart(box.x + 40, box.y + 350, 720, 310, [5, 3, 4, 2, 4, 3, 2], { labels: WEEK, color: P.gold });
      out += card(box.x + 830, box.y + 260, box.width - 830, 470) + text(box.x + 860, box.y + 310, "Paling sering", { size: 22, weight: 700 });
      [["Stok menipis", 11], ["Harga berubah", 6], ["Belum dikirim", 4], ["Ulasan rendah", 2]].forEach(([label, count], i) => {
        const y = box.y + 360 + i * 84;
        out += text(box.x + 860, y + 24, label, { size: 19, weight: 600 }) + rect(box.x + 860, y + 38, (box.width - 920) * (count / 11), 18, [P.ember, P.gold, P.night, P.line][i], { r: 9 })
          + text(box.x + box.width - 30, y + 24, String(count), { size: 19, weight: 700, anchor: "end" });
      });
      return out;
    }),
  ],
  "store-admin": [
    () => frame("store-admin", "Store admin", ["Produk", "Perubahan"], (box) => {
      let out = text(box.x, box.y + 24, "Produk  ›  Kopi Robusta Bubuk 250 g", { size: 17, fill: P.quiet }) + text(box.x, box.y + 70, "Ubah produk", { size: 36, weight: 700 });
      out += card(box.x, box.y + 110, 900, 620);
      out += field(box.x + 30, box.y + 170, 840, "Nama produk", "Kopi Robusta Bubuk 250 g");
      out += field(box.x + 30, box.y + 270, 400, "Harga", "Rp 39.000", { focused: true }) + text(box.x + 30, box.y + 362, "Sebelumnya Rp 42.000", { size: 16, fill: P.emberText, weight: 600 });
      out += field(box.x + 470, box.y + 270, 400, "Stok", "19");
      out += field(box.x + 30, box.y + 400, 400, "Berat (gram)", "260") + field(box.x + 470, box.y + 400, 400, "Kategori", "Minuman · Kopi");
      out += text(box.x + 30, box.y + 520, "Deskripsi", { size: 16, weight: 600, fill: P.quiet }) + rect(box.x + 30, box.y + 532, 840, 110, P.white, { r: 12, stroke: P.line, strokeWidth: 1.5 })
        + text(box.x + 48, box.y + 570, "Kopi robusta dari kebun kecil di lereng gunung, disangrai", { size: 18 }) + text(box.x + 48, box.y + 600, "sedang dan digiling halus. Cocok untuk kopi tubruk.", { size: 18 });
      out += button(box.x + 30, box.y + 664, "Simpan perubahan").markup + button(box.x + 270, box.y + 664, "Batal", { primary: false }).markup;
      out += card(box.x + 940, box.y + 110, box.width - 940, 400) + rect(box.x + 970, box.y + 140, box.width - 1000, 230, P.goldSoft, { r: 14 })
        + circle(box.x + 970 + (box.width - 1000) / 2, box.y + 255, 60, "#8A5A00", { opacity: 0.25 }) + icon(box.x + 970 + (box.width - 1000) / 2 - 30, box.y + 225, 60, ICONS.box, "#8A5A00")
        + text(box.x + 970, box.y + 410, "Pratinjau di toko online", { size: 18, fill: P.quiet }) + text(box.x + 970, box.y + 446, "Kopi Robusta Bubuk 250 g", { size: 20, weight: 700 })
        + text(box.x + 970, box.y + 480, "Rp 39.000", { size: 22, weight: 700, fill: P.emberText });
      return out;
    }),
    () => frame("store-admin", "Store admin", ["Produk", "Perubahan"], (box) => {
      let out = heading(box, "Produk", "8 produk di toko online");
      out += card(box.x, box.y + 100, box.width, 640);
      const rows = PRODUCTS.slice(0, 7).map((p, i) => {
        let state = statusCell("Aktif", "ok");
        if (i === 3) state = statusCell("Dijeda", "gold");
        return [p.name, rupiah(p.price), String(p.stock), state, { draw: (x, cy) => pick(i === 3, button(x, cy - 22, "Aktifkan", { primary: true, size: 16, height: 44 }), button(x, cy - 22, "Jeda", { primary: false, size: 16, height: 44 })).markup }];
      });
      out += table(box.x + 30, box.y + 150, box.width - 60, [0, 520, 720, 860, 1080], ["PRODUK", "HARGA", "STOK", "STATUS", ""], rows, { rowHeight: 80, highlight: (_, i) => pick(i === 3, P.goldSoft, null) });
      out += rect(box.x + 340, box.y + 760, 720, 0.1, P.line);
      return out;
    }),
    () => frame("store-admin", "Store admin", ["Perubahan", "Produk"], (box) => {
      let out = heading(box, "Perubahan terakhir", "Semua yang diubah lewat Store admin");
      const changes = [
        ["Hari ini, 10.12", "Kopi Robusta Bubuk 250 g", "Harga Rp 42.000 → Rp 39.000", "Anda"],
        ["Hari ini, 09.40", "Gula Aren Cair 500 ml", "Listing dijeda (stok tinggal 3)", "Anda"],
        ["Kemarin, 16.05", "Kerupuk Udang 250 g", "Berat 250 g → 280 g", "Mbak Sari"],
        ["Kemarin, 11.20", "Teh Melati Celup isi 25", "Deskripsi diperbarui", "Anda"],
        ["14 Nov, 08.30", "Minyak Kelapa 1 L", "Stok 12 → 27", "Mbak Sari"],
      ];
      changes.forEach(([when, product, change, who], i) => {
        const y = box.y + 110 + i * 124;
        out += circle(box.x + 20, y + 40, 10, pick(i === 0, P.ember, P.night));
        if (i < changes.length - 1) out += line(box.x + 20, y + 52, box.x + 20, y + 152, P.line, 3);
        out += card(box.x + 60, y, box.width - 60, 100) + text(box.x + 90, y + 40, product, { size: 22, weight: 700 }) + text(box.x + 90, y + 74, change, { size: 18, fill: P.quiet })
          + text(box.x + box.width - 30, y + 40, when, { size: 17, fill: P.quiet, anchor: "end" }) + text(box.x + box.width - 30, y + 74, who, { size: 17, weight: 600, anchor: "end" });
      });
      return out;
    }),
  ],
  "stock-sheet": [
    () => frame("stock-sheet", "Stock sheet", ["Stok", "Riwayat"], (box) => {
      let out = heading(box, "Daftar stok", "8 barang · diperbarui 12 menit lalu");
      out += rect(box.x + box.width - 420, box.y + 10, 420, 52, P.white, { r: 26, stroke: P.line, strokeWidth: 1.5 }) + icon(box.x + box.width - 400, box.y + 24, 24, ICONS.search, P.quiet) + text(box.x + box.width - 364, box.y + 44, "Cari barang…", { size: 18, fill: P.quiet });
      out += card(box.x, box.y + 100, box.width, 650);
      out += table(box.x + 30, box.y + 150, box.width - 60, [0, 520, 700, 880, 1080], ["BARANG", "STOK", "BATAS PESAN", "HARGA BELI", "STATUS"],
        PRODUCTS.map((p) => [p.name, `${p.stock} pcs`, "10 pcs", rupiah(p.price * 0.72), statusCell(pick(p.stock < 10, "Pesan ulang", "Aman"), pick(p.stock < 10, "warn", "ok"))]), { rowHeight: 68 });
      return out;
    }),
    () => frame("stock-sheet", "Stock sheet", ["Stok", "Riwayat"], (box) => {
      let out = heading(box, "Daftar stok", "8 barang · diperbarui 12 menit lalu");
      out += card(box.x, box.y + 100, 760, 640);
      out += table(box.x + 30, box.y + 150, 700, [0, 440, 580], ["BARANG", "STOK", ""], PRODUCTS.slice(0, 7).map((p) => [p.name, `${p.stock}`, ""]), { rowHeight: 78, highlight: (_, i) => pick(i === 2, P.emberSoft, null) });
      out += card(box.x + 800, box.y + 100, box.width - 800, 520) + text(box.x + 840, box.y + 160, "Ubah jumlah", { size: 28, weight: 700 }) + text(box.x + 840, box.y + 200, "Kopi Robusta Bubuk 250 g", { size: 19, fill: P.quiet });
      out += rect(box.x + 840, box.y + 240, 72, 72, P.bone, { r: 16 }) + text(box.x + 876, box.y + 288, "–", { size: 36, weight: 700, anchor: "middle" })
        + rect(box.x + 930, box.y + 240, 200, 72, P.white, { r: 16, stroke: P.ember, strokeWidth: 3 }) + text(box.x + 1030, box.y + 290, "31", { size: 36, weight: 700, anchor: "middle" })
        + rect(box.x + 1148, box.y + 240, 72, 72, P.night, { r: 16 }) + text(box.x + 1184, box.y + 288, "+", { size: 36, weight: 700, fill: P.bone, anchor: "middle" });
      out += text(box.x + 840, box.y + 360, "Sebelumnya 19 · +12 dari pemasok", { size: 18, fill: P.green, weight: 600 });
      out += field(box.x + 840, box.y + 400, box.width - 880, "Catatan", "Kiriman dari CV Kopi Lereng, 17 Nov");
      out += button(box.x + 840, box.y + 520, "Simpan").markup + button(box.x + 980, box.y + 520, "Batal", { primary: false }).markup;
      return out;
    }),
    () => frame("stock-sheet", "Stock sheet", ["Perlu dipesan", "Stok", "Riwayat"], (box) => {
      let out = heading(box, "Di bawah batas pesan", "3 barang perlu dipesan ulang");
      const low = PRODUCTS.filter((p) => p.stock < 10);
      low.forEach((p, i) => {
        const x = box.x + i * ((box.width + 30) / 3);
        const w = (box.width - 60) / 3;
        out += card(x, box.y + 100, w, 420) + rect(x, box.y + 100, w, 12, P.ember, { r: 6 }) + text(x + 30, box.y + 170, p.name.split(" ").slice(0, 3).join(" "), { size: 24, weight: 700 })
          + text(x + 30, box.y + 204, p.name.split(" ").slice(3).join(" ") || " ", { size: 18, fill: P.quiet })
          + text(x + 30, box.y + 300, String(p.stock), { size: 72, weight: 700, fill: P.emberText }) + text(x + 30 + String(p.stock).length * 42 + 10, box.y + 300, "pcs tersisa", { size: 20, fill: P.quiet })
          + rect(x + 30, box.y + 330, w - 60, 16, P.bone, { r: 8 }) + rect(x + 30, box.y + 330, (w - 60) * (p.stock / 10), 16, P.ember, { r: 8 })
          + text(x + 30, box.y + 380, "Batas pesan: 10 pcs", { size: 17, fill: P.quiet }) + button(x + 30, box.y + 420, `Pesan ${24 - p.stock} pcs`).markup;
      });
      out += card(box.x, box.y + 560, box.width, 170) + text(box.x + 30, box.y + 615, "Perkiraan biaya pesan ulang", { size: 22, weight: 700 })
        + text(box.x + 30, box.y + 665, "Dari 2 pemasok · dikirim 2–3 hari", { size: 18, fill: P.quiet }) + text(box.x + box.width - 30, box.y + 650, rupiah(1086000), { size: 40, weight: 700, anchor: "end" });
      return out;
    }),
  ],
  "invoice-maker": [
    () => frame("invoice-maker", "Invoice maker", ["Baru", "Belum dibayar", "Semua"], (box) => {
      let out = heading(box, "Faktur baru", "INV-2026-0142");
      out += card(box.x, box.y + 100, 900, 640);
      out += field(box.x + 30, box.y + 160, 400, "Pelanggan", "Warung Bu Wati") + field(box.x + 470, box.y + 160, 400, "Jatuh tempo", "24 November 2026");
      out += table(box.x + 30, box.y + 290, 840, [0, 440, 560, 700], ["BARANG", "JUMLAH", "HARGA", "SUBTOTAL"], [
        [PRODUCTS[0].name, "20", rupiah(16000), rupiah(320000)],
        [PRODUCTS[4].name, "15", rupiah(20000), rupiah(300000)],
        [PRODUCTS[1].name, "12", rupiah(22000), rupiah(264000)],
      ], { rowHeight: 66 });
      out += text(box.x + 30, box.y + 540, "+ Tambah barang", { size: 19, weight: 700, fill: P.emberText });
      out += line(box.x + 470, box.y + 580, box.x + 870, box.y + 580, P.line, 1.5) + text(box.x + 470, box.y + 625, "Total", { size: 22, weight: 700 }) + text(box.x + 870, box.y + 625, rupiah(884000), { size: 30, weight: 700, anchor: "end" });
      out += button(box.x + 30, box.y + 664, "Simpan faktur").markup;
      out += card(box.x + 940, box.y + 100, box.width - 940, 300) + text(box.x + 970, box.y + 150, "Pelanggan", { size: 22, weight: 700 })
        + text(box.x + 970, box.y + 196, "Warung Bu Wati", { size: 20, weight: 600 }) + text(box.x + 970, box.y + 228, "Jl. Melati No. 12, Sleman", { size: 18, fill: P.quiet }) + text(box.x + 970, box.y + 258, "0812-0000-1234 (contoh)", { size: 18, fill: P.quiet })
        + text(box.x + 970, box.y + 320, "5 faktur sebelumnya · semua lunas", { size: 17, fill: P.green, weight: 600 });
      return out;
    }),
    () => frame("invoice-maker", "Invoice maker", ["Belum dibayar", "Baru", "Semua"], (box) => {
      let out = heading(box, "Belum dibayar", "4 faktur · total Rp 2.746.000");
      out += card(box.x, box.y + 100, box.width, 520);
      out += table(box.x + 30, box.y + 150, box.width - 60, [0, 240, 620, 860, 1080], ["NO.", "PELANGGAN", "JATUH TEMPO", "TOTAL", "STATUS"], [
        ["INV-0138", "Kedai Kopi Pak Hendra", "10 Nov", rupiah(630000), statusCell("Lewat 7 hari", "warn")],
        ["INV-0139", "Warung Bu Rina", "15 Nov", rupiah(412000), statusCell("Lewat 2 hari", "warn")],
        ["INV-0141", "Catering Mbak Sari", "20 Nov", rupiah(820000), statusCell("3 hari lagi", "gold")],
        ["INV-0142", "Warung Bu Wati", "24 Nov", rupiah(884000), statusCell("7 hari lagi", "quiet")],
      ], { rowHeight: 86 });
      out += card(box.x, box.y + 650, box.width, 90) + icon(box.x + 30, box.y + 680, 30, ICONS.bell, P.emberText)
        + text(box.x + 76, box.y + 704, "2 faktur sudah lewat jatuh tempo. Kirim pengingat lewat WhatsApp?", { size: 20, weight: 600 }) + button(box.x + box.width - 240, box.y + 672, "Kirim pengingat").markup;
      return out;
    }),
    () => frame("invoice-maker", "Invoice maker", ["Semua", "Baru", "Belum dibayar"], (box) => {
      let out = rect(box.x + 260, box.y, 640, 730, P.white, { r: 8, stroke: P.line, strokeWidth: 1.5 });
      const x = box.x + 310;
      out += text(x, box.y + 70, "FAKTUR", { size: 34, weight: 800, spacing: 4 }) + text(x + 540, box.y + 60, "Toko Sinar Pagi", { size: 18, weight: 700, anchor: "end" }) + text(x + 540, box.y + 86, "Jl. Kenanga No. 5, Yogyakarta", { size: 15, fill: P.quiet, anchor: "end" });
      out += text(x, box.y + 140, "Untuk", { size: 15, fill: P.quiet }) + text(x, box.y + 168, "Warung Bu Wati", { size: 20, weight: 700 }) + text(x + 540, box.y + 140, "INV-2026-0142", { size: 15, fill: P.quiet, anchor: "end" }) + text(x + 540, box.y + 168, "Jatuh tempo 24 Nov 2026", { size: 17, weight: 600, anchor: "end" });
      out += table(x, box.y + 230, 540, [0, 300, 420], ["BARANG", "JML", "SUBTOTAL"], [["Keripik Singkong 200 g", "20", rupiah(320000)], ["Kerupuk Udang 250 g", "15", rupiah(300000)], ["Sambal Bawang 150 ml", "12", rupiah(264000)]], { rowHeight: 60 });
      out += text(x, box.y + 500, "Total", { size: 22, weight: 700 }) + text(x + 540, box.y + 500, rupiah(884000), { size: 30, weight: 700, anchor: "end" });
      out += rect(x, box.y + 540, 540, 110, P.bone, { r: 10 }) + text(x + 20, box.y + 578, "Transfer ke rekening (contoh)", { size: 16, fill: P.quiet }) + text(x + 20, box.y + 612, "Bank Contoh · 000-111-2222 · a.n. Sinar Pagi", { size: 17, weight: 600 });
      out += card(box.x + 940, box.y, box.width - 940, 330) + text(box.x + 970, box.y + 50, "Siap dikirim", { size: 24, weight: 700 }) + text(box.x + 970, box.y + 86, "Pilih cara mengirim faktur ini.", { size: 18, fill: P.quiet })
        + button(box.x + 970, box.y + 120, "Kirim lewat WhatsApp").markup + button(box.x + 970, box.y + 186, "Kirim lewat email", { primary: false }).markup + button(box.x + 970, box.y + 252, "Unduh PDF", { primary: false }).markup;
      return out;
    }),
  ],
  "delivery-tracker": [
    () => frame("delivery-tracker", "Delivery tracker", ["Dalam perjalanan", "Terkirim"], (box) => {
      let out = heading(box, "Paket dalam perjalanan", "5 paket · kurir contoh");
      [["#2039", CUSTOMERS[2], "Sleman", 0.8, "Tiba hari ini"], ["#2037", CUSTOMERS[4], "Bantul", 0.55, "Besok"], ["#2036", CUSTOMERS[5], "Magelang", 0.35, "Besok"], ["#2034", CUSTOMERS[0], "Klaten", 0.2, "2 hari lagi"], ["#2033", CUSTOMERS[1], "Solo", 0.9, "Tiba hari ini"]].forEach(([no, who, city, progress, eta], i) => {
        const y = box.y + 100 + i * 128;
        out += card(box.x, y, box.width, 110) + circle(box.x + 56, y + 55, 28, P.goldSoft) + icon(box.x + 40, y + 39, 32, ICONS.truck, "#8A5A00")
          + text(box.x + 106, y + 46, `${no} · ${who}`, { size: 22, weight: 700 }) + text(box.x + 106, y + 80, `Ke ${city}`, { size: 18, fill: P.quiet })
          + rect(box.x + 460, y + 50, 620, 12, P.bone, { r: 6 }) + rect(box.x + 460, y + 50, 620 * progress, 12, P.night, { r: 6 }) + circle(box.x + 460 + 620 * progress, y + 56, 11, P.ember)
          + text(box.x + box.width - 30, y + 62, eta, { size: 19, weight: 700, anchor: "end", fill: pick(progress > 0.7, P.green, P.night) });
      });
      return out;
    }),
    () => frame("delivery-tracker", "Delivery tracker", ["Dalam perjalanan", "Terkirim"], (box) => {
      let out = text(box.x, box.y + 30, "Paket #2039 · Mbak Sari", { size: 36, weight: 700 }) + text(box.x, box.y + 66, "Resi CONTOH-88213 · ke Sleman", { size: 19, fill: P.quiet });
      out += card(box.x, box.y + 100, 760, 640);
      [["Diterima kurir", "16 Nov, 14.20", "Gudang Toko Sinar Pagi"], ["Di pusat sortir", "16 Nov, 19.05", "Yogyakarta"], ["Dibawa kurir", "17 Nov, 08.10", "Menuju Sleman"], ["Tiba di tujuan", "Perkiraan 17 Nov, 13.00", ""]].forEach(([title, when, where], i) => {
        const y = box.y + 160 + i * 140;
        const done = i < 3;
        out += circle(box.x + 70, y + 20, 18, pick(done, P.night, P.white), { stroke: P.night, strokeWidth: 3 });
        if (done) out += icon(box.x + 58, y + 8, 24, ICONS.check, P.bone, 3);
        if (i < 3) out += line(box.x + 70, y + 42, box.x + 70, y + 138, pick(i < 2, P.night, P.line), 4, { dash: pick(i < 2, "", "4 8") });
        out += text(box.x + 120, y + 18, title, { size: 23, weight: 700, fill: pick(done, P.night, P.quiet) }) + text(box.x + 120, y + 50, `${when}${pick(where, " · " + where, "")}`, { size: 18, fill: P.quiet });
      });
      out += card(box.x + 800, box.y + 100, box.width - 800, 640) + rect(box.x + 820, box.y + 120, box.width - 840, 600, "#EFE9DD", { r: 14 });
      out += path(`M${box.x + 880} ${box.y + 640} C ${box.x + 980} ${box.y + 480}, ${box.x + 1120} ${box.y + 560}, ${box.x + 1180} ${box.y + 380} S ${box.x + 1320} ${box.y + 220}, ${box.x + 1380} ${box.y + 200}`, { stroke: P.night, width: 5 }).replace("/>", ' stroke-dasharray="2 14"/>');
      out += circle(box.x + 880, box.y + 640, 16, P.gold) + circle(box.x + 1380, box.y + 200, 20, P.ember) + circle(box.x + 1180, box.y + 380, 22, P.night) + icon(box.x + 1168, box.y + 368, 24, ICONS.truck, P.bone);
      return out;
    }),
    () => frame("delivery-tracker", "Delivery tracker", ["Terkirim", "Dalam perjalanan"], (box) => {
      let out = heading(box, "Terkirim hari ini", "7 paket sampai, semuanya tepat waktu");
      out += statCard(box.x, box.y + 100, 420, "Terkirim", "7", "100% tepat waktu", P.green) + statCard(box.x + 450, box.y + 100, 420, "Rata-rata waktu kirim", "1,4 hari", "lebih cepat 0,3 hari", P.green)
        + statCard(box.x + 900, box.y + 100, box.width - 900, "Ongkir dibayar", rupiah(124000), "untuk 7 paket");
      out += card(box.x, box.y + 260, box.width, 480);
      out += table(box.x + 30, box.y + 310, box.width - 60, [0, 200, 520, 800, 1080], ["NO.", "PENERIMA", "KOTA", "SAMPAI", "STATUS"],
        [["#2031", CUSTOMERS[3], "Sleman", "09.12", statusCell("Diterima", "ok")], ["#2030", CUSTOMERS[0], "Yogyakarta", "10.40", statusCell("Diterima", "ok")], ["#2029", CUSTOMERS[4], "Bantul", "11.05", statusCell("Diterima", "ok")],
          ["#2028", CUSTOMERS[1], "Kulon Progo", "12.30", statusCell("Diterima", "ok")], ["#2027", CUSTOMERS[5], "Wates", "13.15", statusCell("Diterima", "ok")], ["#2026", CUSTOMERS[2], "Sleman", "14.02", statusCell("Diterima", "ok")]], { rowHeight: 66 });
      return out;
    }),
  ],
  "shop-website": [
    () => frame("shop-website", "Shop website", ["Halaman", "Produk", "Kontak"], (box) => {
      let out = rect(box.x, box.y, box.width, box.height, P.white, { r: 16, stroke: P.line, strokeWidth: 1.5 });
      out += text(box.x + 40, box.y + 56, "Toko Sinar Pagi", { size: 26, weight: 800 }) + text(box.x + box.width - 40, box.y + 56, "Produk     Tentang     Kontak", { size: 18, fill: P.quiet, anchor: "end" });
      out += rect(box.x + 40, box.y + 90, box.width - 80, 260, P.night, { r: 18 }) + circle(box.x + box.width - 240, box.y + 220, 110, P.ember) + circle(box.x + box.width - 160, box.y + 160, 60, P.gold)
        + text(box.x + 90, box.y + 190, "Camilan & bumbu rumahan", { size: 44, weight: 800, fill: P.bone }) + text(box.x + 90, box.y + 236, "Dikirim dari Yogyakarta setiap hari kerja.", { size: 22, fill: P.bone })
        + chip(box.x + 90, box.y + 266, "Belanja sekarang", { fill: P.gold, color: P.night, size: 19, height: 50, weight: 700 }).markup;
      PRODUCTS.slice(0, 4).forEach((p, i) => {
        const w = (box.width - 80 - 90) / 4;
        const x = box.x + 40 + i * (w + 30);
        out += rect(x, box.y + 390, w, 200, [P.goldSoft, P.emberSoft, P.bone, P.goldSoft][i], { r: 14 }) + icon(x + w / 2 - 30, box.y + 460, 60, ICONS.box, P.night)
          + text(x, box.y + 625, pick(p.name.length > 26, p.name.slice(0, 24) + "…", p.name), { size: 18, weight: 600 }) + text(x, box.y + 655, rupiah(p.price), { size: 19, weight: 700, fill: P.emberText });
      });
      return out;
    }),
    () => frame("shop-website", "Shop website", ["Produk", "Halaman", "Kontak"], (box) => {
      let out = heading(box, "Ubah produk di website", "Perubahan langsung tampil di tokosinarpagi.contoh");
      out += card(box.x, box.y + 100, 860, 640);
      out += rect(box.x + 30, box.y + 130, 200, 200, P.goldSoft, { r: 14 }) + icon(box.x + 100, box.y + 200, 60, ICONS.box, "#8A5A00") + button(box.x + 260, box.y + 200, "Ganti foto", { primary: false }).markup;
      out += field(box.x + 30, box.y + 380, 800, "Nama", "Sambal Bawang Botol 150 ml") + field(box.x + 30, box.y + 480, 380, "Harga", "Rp 25.000") + field(box.x + 450, box.y + 480, 380, "Label", "Terlaris", { focused: true });
      out += button(box.x + 30, box.y + 640, "Simpan").markup;
      out += card(box.x + 900, box.y + 100, box.width - 900, 500) + text(box.x + 930, box.y + 145, "Pratinjau", { size: 18, fill: P.quiet })
        + rect(box.x + 930, box.y + 170, box.width - 960, 260, P.emberSoft, { r: 14 }) + chip(box.x + 950, box.y + 190, "Terlaris", { fill: P.night, color: P.bone, size: 15, height: 32, weight: 700 }).markup
        + icon(box.x + 930 + (box.width - 960) / 2 - 36, box.y + 264, 72, ICONS.box, P.emberText)
        + text(box.x + 930, box.y + 476, "Sambal Bawang Botol 150 ml", { size: 21, weight: 700 }) + text(box.x + 930, box.y + 512, "Rp 25.000", { size: 22, weight: 700, fill: P.emberText });
      return out;
    }),
    () => frame("shop-website", "Shop website", ["Kontak", "Halaman", "Produk"], (box) => {
      let out = rect(box.x, box.y, box.width, box.height, P.white, { r: 16, stroke: P.line, strokeWidth: 1.5 });
      out += text(box.x + 60, box.y + 90, "Hubungi kami", { size: 44, weight: 800 }) + text(box.x + 60, box.y + 134, "Pesan lewat WhatsApp atau datang langsung ke toko.", { size: 22, fill: P.quiet });
      [[ICONS.phone, "WhatsApp", "0812-0000-5678 (contoh)"], [ICONS.pin, "Alamat", "Jl. Kenanga No. 5, Yogyakarta"], [ICONS.clock, "Jam buka", "Senin–Sabtu, 07.00–21.00"]].forEach(([glyph, label, value], i) => {
        const y = box.y + 200 + i * 130;
        out += circle(box.x + 96, y + 40, 34, P.emberSoft) + icon(box.x + 78, y + 22, 36, glyph, P.emberText) + text(box.x + 156, y + 30, label, { size: 18, fill: P.quiet }) + text(box.x + 156, y + 64, value, { size: 24, weight: 700 });
      });
      out += rect(box.x + 760, box.y + 60, box.width - 820, 560, "#EFE9DD", { r: 18 });
      for (let i = 0; i < 6; i += 1) out += line(box.x + 760, box.y + 120 + i * 90, box.x + box.width - 60, box.y + 80 + i * 100, "#E1D8C7", 14);
      out += circle(box.x + 1080, box.y + 330, 30, P.ember) + circle(box.x + 1080, box.y + 330, 11, P.white);
      out += chip(box.x + 760, box.y + 650, "Buka di peta", { fill: P.night, color: P.bone, size: 19, height: 50, weight: 700 }).markup;
      return out;
    }),
  ],
  todo: [
    () => todoScreen({ filter: "Hari ini", tasks: TODO_TASKS.filter((t) => !t.done && t.due !== "upcoming") }),
    () => todoScreen({ filter: "Semua", tasks: TODO_TASKS.slice(0, 4), adding: true }),
    () => todoScreen({ filter: "Semua", tasks: TODO_TASKS, ticking: true }),
    () => todoScreen({ filter: "Hari ini", tasks: TODO_TASKS.filter((t) => t.due !== "upcoming"), closing: true }),
  ],
};

// To-do previews echo the To-do app's own notebook look.
const TODO_TASKS = [
  { title: "Bayar tagihan pemasok gula aren", note: "Transfer Rp 840.000", due: "overdue", label: "Terlambat · 14 Nov" },
  { title: "Balas pesan Bu Rina soal pesanan katering", note: "", due: "overdue", label: "Terlambat · kemarin" },
  { title: "Isi ulang rak keripik dan kerupuk", note: "Ambil 2 dus dari gudang", due: "today", label: "Hari ini" },
  { title: "Hitung uang kas sebelum tutup", note: "", due: "today", label: "Hari ini" },
  { title: "Foto produk baru untuk toko online", note: "Kopi robusta kemasan 500 g", due: "upcoming", label: "Kamis" },
  { title: "Sapu dan pel gudang", note: "", due: "today", label: "Hari ini", done: true },
];

function todoScreen({ filter, tasks, adding = false, ticking = false, closing = false }) {
  return appFrame("To-do", P.ember, (box) => {
    const paper = "#F3EDE1";
    let out = rect(box.x - 40, box.y - 40, box.width + 80, box.height + 80, paper, { r: 0 });
    for (let gx = box.x - 30; gx < box.x + box.width + 40; gx += 26) for (let gy = box.y - 30; gy < box.y + box.height + 40; gy += 26) out += circle(gx, gy, 1.3, "#D8CDB9");
    out += text(box.x, box.y + 8, "SELASA 17 NOVEMBER", { size: 15, weight: 600, fill: P.quiet, spacing: 3 })
      + text(box.x - 4, box.y + 90, "To-do", { size: 84, weight: 400, family: "Georgia, 'Times New Roman', serif" }).replace("<text", '<text font-style="italic"')
      + path(`M${box.x} ${box.y + 112} C ${box.x + 60} ${box.y + 100}, ${box.x + 140} ${box.y + 104}, ${box.x + 220} ${box.y + 98}`, { stroke: P.ember, width: 6 });
    const open = TODO_TASKS.filter((t) => !t.done).length;
    out += text(box.x + 260, box.y + 90, `${open} terbuka · 2 terlambat`, { size: 19, fill: P.quiet });
    // Filters
    let fx = box.x + 760;
    [["Semua", TODO_TASKS.length], ["Hari ini", 4], ["Mendatang", 1], ["Selesai", 1]].forEach(([label, count]) => {
      const active = label === filter;
      const c = chip(fx, box.y + 52, `${label}  ${count}`, { fill: pick(active, P.gold, P.white), color: P.night, stroke: P.night, size: 18, height: 46, weight: pick(active, 700, 500) });
      if (active) out += rect(fx + 4, box.y + 56, c.width, 46, P.night, { r: 23 });
      out += c.markup;
      fx += c.width + 14;
    });
    let top = box.y + 150;
    if (adding) {
      out += rect(box.x + 7, top + 7, box.width, 150, P.ember, { r: 6 }) + rect(box.x, top, box.width, 150, "#FFFCF5", { r: 6, stroke: P.night, strokeWidth: 2 })
        + rect(box.x + box.width / 2 - 60, top - 12, 120, 24, "#F5CF4F", { opacity: 0.8 })
        + text(box.x + 30, top + 40, "JUDUL", { size: 14, weight: 700, spacing: 2 }) + text(box.x + 30, top + 84, "Pesan galon air untuk besok|", { size: 28, family: "Georgia, serif" }) + line(box.x + 30, top + 98, box.x + 820, top + 98, P.ember, 3)
        + text(box.x + 860, top + 40, "TENGGAT", { size: 14, weight: 700, spacing: 2 }) + text(box.x + 860, top + 84, "18/11/2026", { size: 22 }) + line(box.x + 860, top + 98, box.x + 1140, top + 98, P.night, 2)
        + button(box.x + 30, top + 108, "Tambah tugas", { size: 16, height: 36 }).markup;
      top += 186;
    }
    const rowHeight = 92;
    const listHeight = Math.min(tasks.length, Math.floor((box.y + box.height - top) / rowHeight)) * rowHeight + 10;
    out += rect(box.x + 8, top + 8, box.width, listHeight, P.night, { r: 6 }) + rect(box.x, top, box.width, listHeight, "#FFFCF5", { r: 6, stroke: P.night, strokeWidth: 2 });
    out += line(box.x + 70, top, box.x + 70, top + listHeight, P.ember, 2);
    tasks.slice(0, Math.floor((listHeight - 10) / rowHeight)).forEach((task, i) => {
      const y = top + 5 + i * rowHeight;
      let done = task.done === true;
      if (ticking && i === 2) done = true;
      if (i > 0) out += line(box.x, y, box.x + box.width, y, "#DDD2BF", 1.5, { dash: "6 6" });
      out += text(box.x + 52, y + 44, String(i + 1).padStart(2, "0"), { size: 22, family: "Georgia, serif", fill: P.emberText, anchor: "end" }).replace("<text", '<text font-style="italic"');
      out += circle(box.x + 106, y + 36, 15, pick(done, P.ember, "#FFFCF5"), { stroke: pick(done, P.ember, P.night), strokeWidth: 2.5 });
      if (done) out += path(`M${box.x + 99} ${y + 36}l5 5 10-11`, { stroke: P.night, width: 3 });
      out += text(box.x + 140, y + 44, task.title, { size: 25, family: "Georgia, serif", fill: pick(done, P.quiet, P.night) });
      if (done) out += line(box.x + 140, y + 36, box.x + 140 + task.title.length * 10.4, y + 36, P.ember, 2.5);
      let meta = box.x + 140;
      if (task.due === "overdue" && !done) {
        out += `<g transform="rotate(-3 ${meta + 70} ${y + 70})">${rect(meta, y + 56, 140, 26, "none", { r: 3, stroke: P.emberText, strokeWidth: 2 })}${icon(meta + 6, y + 60, 18, ICONS.warn, P.emberText)}${text(meta + 30, y + 75, "TERLAMBAT", { size: 13, weight: 800, fill: P.emberText, spacing: 2 })}</g>`;
        meta += 160;
        out += text(meta, y + 75, task.label.split(" · ")[1].toUpperCase(), { size: 14, fill: P.quiet, spacing: 1.5 });
      } else {
        out += text(meta, y + 75, `TENGGAT ${task.label.toUpperCase()}`, { size: 14, fill: P.quiet, spacing: 1.5 });
      }
      if (task.note) out += text(box.x + 520, y + 75, task.note, { size: 16, fill: P.quiet });
      out += icon(box.x + box.width - 96, y + 26, 22, "M4 20h4L19 9l-4-4L4 16ZM13.5 6.5l4 4", P.quiet) + icon(box.x + box.width - 52, y + 26, 22, "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3", P.quiet);
    });
    if (closing) {
      const y = box.y + box.height - 60;
      out += rect(box.x, y, box.width, 60, P.night, { r: 6 }) + text(box.x + 24, y + 38, "Sebelum tutup: 4 tugas lagi, 2 di antaranya terlambat.", { size: 19, fill: P.bone, weight: 600 });
    }
    return out;
  }, { nav: [] });
}

export function screensFor(id) {
  const list = SCREENS[id];
  if (!list) throw new Error(`No preview screens for ${id}`);
  return list;
}
