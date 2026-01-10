// lib/prisma.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient | undefined };

// DB 연결 가능 여부 확인
const isDatabaseConfigured = !!(
  process.env.DATABASE_URL && 
  process.env.DATABASE_URL !== 'your-database-url-here'
);

export const prisma = isDatabaseConfigured
  ? globalForPrisma.prisma ?? new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    })
  : null;

if (process.env.NODE_ENV !== 'production' && isDatabaseConfigured) {
  globalForPrisma.prisma = prisma as PrismaClient;
}

// DB 사용 가능 여부를 체크하는 헬퍼
export function isDatabaseAvailable(): boolean {
  return isDatabaseConfigured && prisma !== null;
}
