import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("admin123", 10);
  await prisma.admin.upsert({
    where: { username: "admin" },
    update: {},
    create: { username: "admin", passwordHash },
  });

  await upsertMekanik("Budi Santoso");
  await upsertMekanik("Agus Wijaya");

  await upsertJasa("Servis Ringan", 50000);
  await upsertJasa("Servis Besar", 150000);
  await upsertJasa("Ganti Oli", 30000);
  await upsertJasa("Tune Up", 80000);

  await upsertSparepart("Oli Mesin", "liter", 45000, 50);
  await upsertSparepart("Busi", "pcs", 25000, 40);
  await upsertSparepart("Kampas Rem", "pcs", 60000, 30);
  await upsertSparepart("Filter Udara", "pcs", 35000, 25);

  console.log("Seed selesai. Login admin: admin / admin123");
}

async function upsertMekanik(nama: string) {
  const existing = await prisma.mekanik.findFirst({ where: { nama } });
  if (existing) return existing;
  return prisma.mekanik.create({ data: { nama } });
}

async function upsertJasa(nama: string, harga: number) {
  const existing = await prisma.jasaServis.findFirst({ where: { nama } });
  if (existing) return existing;
  return prisma.jasaServis.create({ data: { nama, harga } });
}

async function upsertSparepart(nama: string, satuan: string, harga: number, stok: number) {
  const existing = await prisma.sparepart.findFirst({ where: { nama } });
  if (existing) return existing;
  return prisma.sparepart.create({ data: { nama, satuan, harga, stok } });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
