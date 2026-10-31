import { PrismaClient } from "@prisma/client";

// Segredos do login nunca saem do banco por acaso (ex.: um usuário passado inteiro para uma tela).
// Quem precisa deles (o login, a troca de senha) pede de propósito com `omit: { ...withSecrets }` ou `select`.
const secretsOmitted = {
  user: { passwordHash: true, totpSecret: true, totpRecoveryCodes: true },
  platformUser: { passwordHash: true, totpSecret: true, totpRecoveryCodes: true },
} as const;
export const withSecrets = { passwordHash: false, totpSecret: false, totpRecoveryCodes: false } as const;

function createClient() {
  return new PrismaClient({ omit: secretsOmitted });
}

// Uma única conexão com o banco reaproveitada pelo sistema todo.
const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
