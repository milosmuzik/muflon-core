import { PrismaClient } from "@prisma/client";

// Standardní singleton pattern pro Next.js dev mód (hot-reload nevytváří nová spojení).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
