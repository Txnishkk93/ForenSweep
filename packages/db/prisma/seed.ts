import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to seed @repo/db");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

const passwords = {
  admin: process.env.FORENSWEEP_ADMIN_PASSWORD ?? "ForenSweep-Admin-Dev-Only!2026",
  operator: process.env.FORENSWEEP_OPERATOR_PASSWORD ?? "ForenSweep-Operator-Dev-Only!2026",
  investigator: process.env.FORENSWEEP_INVESTIGATOR_PASSWORD ?? "ForenSweep-Investigator-Dev-Only!2026",
};

const users = [
  { id: "00000000-0000-4000-8000-000000000001", username: "admin", email: "admin@forensweep.local", role: "ADMIN" as const, password: passwords.admin },
  { id: "00000000-0000-4000-8000-000000000002", username: "operator", email: "operator@forensweep.local", role: "OPERATOR" as const, password: passwords.operator },
  { id: "00000000-0000-4000-8000-000000000003", username: "investigator", email: "investigator@forensweep.local", role: "INVESTIGATOR" as const, password: passwords.investigator },
];

const devices = [
  { id: "00000000-0000-4000-8000-000000000101", path: "SAFE_IMAGE_ROOT/demo-hdd.img", type: "HDD" as const, model: "ForenSweep Mock HDD", serial: "MOCK-HDD-001", sizeBytes: 107374182400n, supportsAta: false, supportsNvme: false, supportsSed: false },
  { id: "00000000-0000-4000-8000-000000000102", path: "SAFE_IMAGE_ROOT/demo-sata-ssd.img", type: "SSD" as const, model: "ForenSweep Mock SATA SSD", serial: "MOCK-SATA-SSD-001", sizeBytes: 256000000000n, supportsAta: true, supportsNvme: false, supportsSed: false },
  { id: "00000000-0000-4000-8000-000000000103", path: "SAFE_IMAGE_ROOT/demo-nvme.img", type: "SSD" as const, model: "ForenSweep Mock NVMe SSD", serial: "MOCK-NVME-001", sizeBytes: 512000000000n, supportsAta: false, supportsNvme: true, supportsSed: false },
  { id: "00000000-0000-4000-8000-000000000104", path: "SAFE_IMAGE_ROOT/demo-usb.img", type: "USB" as const, model: "ForenSweep Mock USB Drive", serial: "MOCK-USB-001", sizeBytes: 32000000000n, supportsAta: false, supportsNvme: false, supportsSed: false },
  { id: "00000000-0000-4000-8000-000000000105", path: "SAFE_IMAGE_ROOT/demo-safe-image.img", type: "UNKNOWN" as const, model: "ForenSweep Safe Demo Image", serial: "SAFE-DEMO-001", sizeBytes: 67108864n, supportsAta: false, supportsNvme: false, supportsSed: false },
];

try {
  for (const user of users) {
    await prisma.user.upsert({
      where: { username: user.username },
      update: { email: user.email, role: user.role, passwordHash: await bcrypt.hash(user.password, 12) },
      create: { id: user.id, username: user.username, email: user.email, role: user.role, passwordHash: await bcrypt.hash(user.password, 12) },
    });
  }

  for (const device of devices) {
    await prisma.device.upsert({
      where: { id: device.id },
      update: device,
      create: { ...device, mounted: false, isSystemDisk: false, capabilitySnapshot: { simulated: true } },
    });
  }
} finally {
  await prisma.$disconnect();
}

console.log(`Seeded ${users.length} development accounts and ${devices.length} simulated devices.`);