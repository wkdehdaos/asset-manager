import { PrismaClient } from "@prisma/client";

// Next 개발 서버의 HMR로 PrismaClient가 여러 개 생성되는 것을 막는다.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
