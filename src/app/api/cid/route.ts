import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(request: Request) {
  if (!(await getCurrentUser())) return NextResponse.json([], { status: 401 });

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json([]);

  // "J45", "j45.9" ou "J459" procuram pelo código; o resto procura pelo nome.
  const looksLikeCode = /^[a-z]\d/i.test(q);
  const code = q.toUpperCase().replace(/^([A-Z]\d{2})\.?(\d?)$/, (_, a, b) => (b ? `${a}.${b}` : a));

  const results = await prisma.cid10.findMany({
    where: looksLikeCode
      ? { code: { startsWith: code } }
      : { description: { contains: q, mode: "insensitive" } },
    orderBy: { code: "asc" },
    take: 20,
  });
  return NextResponse.json(results);
}
