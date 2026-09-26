/**
 * Verifikasi UI end-to-end dengan browser sungguhan (Playwright + Chromium).
 * Jalankan manual: node scripts/e2e-playwright.js (server dev harus jalan di :3000)
 */
const { chromium } = require("playwright");

const BASE_URL = "http://localhost:3000";

function waitFor(page, predicate, timeout = 8000) {
  return page.waitForFunction(predicate, { timeout });
}

function randomPlat() {
  return `E2E-${Math.floor(Math.random() * 9000 + 1000)}`;
}

function randomFutureDate() {
  const d = new Date();
  d.setDate(d.getDate() + 2 + Math.floor(Math.random() * 5000));
  return d.toISOString().slice(0, 10);
}

async function main() {
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium",
  });
  const page = await browser.newPage();
  let pass = 0;
  let fail = 0;
  const ok = (msg) => {
    pass++;
    console.log(`  PASS - ${msg}`);
  };
  const bad = (msg) => {
    fail++;
    console.log(`  FAIL - ${msg}`);
  };

  const plat = randomPlat();
  const tanggal = randomFutureDate();

  try {
    console.log("[1] Buat booking lewat halaman publik /booking");
    await page.goto(`${BASE_URL}/booking`);
    await waitFor(page, () => document.querySelectorAll('input[type="checkbox"]').length > 0);
    await page.fill('input[type="date"]', tanggal);
    await waitFor(page, () => {
      const btn = Array.from(document.querySelectorAll("button")).find((b) =>
        b.textContent.trim().startsWith("08:00")
      );
      return btn && !btn.disabled;
    });

    await page.click('button:has-text("08:00")');
    await page.check('input[type="checkbox"] >> nth=0');
    await page.fill('input[placeholder="Plat Nomor"]', plat);
    await page.fill('input[placeholder="Merk"]', "Honda");
    await page.fill('input[placeholder="Model"]', "Beat");
    await page.fill('input[placeholder="Nama Pemilik"]', "E2E Tester");
    await page.fill('input[placeholder="Telepon"]', "081377776666");
    await page.click('button:has-text("Booking Sekarang")');

    try {
      await waitFor(page, () => document.body.textContent.includes("Booking berhasil dibuat"));
      ok("Booking berhasil dibuat lewat halaman publik /booking");
    } catch {
      const body = await page.textContent("body");
      bad(`Booking gagal dibuat: ${body.slice(0, 300)}`);
    }

    console.log("[2] Reload /booking, cek slot 08:00 mekanik yang sama sudah disabled");
    await page.reload();
    try {
      await waitFor(page, () => document.body.textContent.includes("08:00 (terisi)"));
      ok("Slot 08:00 ditampilkan sebagai terisi (disabled) setelah booking dibuat");
    } catch {
      const body = await page.textContent("body");
      bad(`Slot 08:00 tidak ditampilkan terisi setelah booking dibuat: ${body.slice(0, 300)}`);
    }

    console.log("[3] Login admin, cek booking baru muncul di dashboard, selesaikan servis");
    await page.goto(`${BASE_URL}/login`);
    await page.fill("input", "admin");
    await page.fill('input[type="password"]', "admin123");
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE_URL}/dashboard`, { timeout: 10000 });
    ok("Berhasil login admin dan redirect ke /dashboard");

    try {
      await waitFor(page, (p) => document.body.textContent.includes(p), 8000);
    } catch {
      /* fallback below re-checks */
    }
    await page.waitForFunction((p) => document.body.textContent.includes(p), plat, { timeout: 8000 }).catch(() => {});
    const dashboardBody = await page.textContent("body");
    if (dashboardBody.includes(plat)) {
      ok("Booking baru muncul di daftar Booking dashboard admin");
    } else {
      bad("Booking baru tidak muncul di dashboard admin");
    }

    await page.click('button:has-text("Selesaikan Servis")');
    await waitFor(page, () => document.body.textContent.includes("Konfirmasi Selesai"));
    await page.click('button:has-text("Konfirmasi Selesai")');
    try {
      await page.waitForFunction((p) => {
        const text = document.body.textContent;
        return text.includes(p) && text.includes("Selesai");
      }, plat, { timeout: 8000 });
      ok("Servis berhasil ditandai SELESAI dari dashboard admin");
    } catch {
      bad("Servis gagal ditandai selesai");
    }

    console.log("[4] Cek /riwayat menampilkan booking dengan status Selesai");
    await page.goto(`${BASE_URL}/riwayat`);
    await page.fill('input[placeholder="Masukkan plat nomor"]', plat);
    await page.click('button:has-text("Cek")');
    try {
      await waitFor(page, () => document.body.textContent.includes("Selesai"));
      ok("Halaman /riwayat menampilkan booking dengan status Selesai");
    } catch {
      const body = await page.textContent("body");
      bad(`Riwayat tidak menampilkan status Selesai: ${body.slice(0, 300)}`);
    }

    console.log("[5] Cek plat nomor yang tidak ada -> pesan error");
    await page.goto(`${BASE_URL}/riwayat`);
    await page.fill('input[placeholder="Masukkan plat nomor"]', "TIDAK-ADA-999");
    await page.click('button:has-text("Cek")');
    try {
      await waitFor(page, () => document.body.textContent.includes("tidak ditemukan"));
      ok("Plat nomor yang tidak ada menampilkan pesan error yang jelas");
    } catch {
      bad("Tidak ada pesan error untuk plat nomor invalid");
    }
  } catch (e) {
    bad(`Exception selama test: ${e.message}`);
  }

  await browser.close();
  console.log(`\n=== Hasil E2E: ${pass} PASS, ${fail} FAIL ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
