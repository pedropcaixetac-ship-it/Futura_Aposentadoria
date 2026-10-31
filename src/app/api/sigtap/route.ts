import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { procedureWhere } from "@/lib/sigtap";

export async function GET(request: Request) {
  if (!(await getCurrentUser())) return NextResponse.json([], { status: 401 });

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json([]);

  const results = await prisma.sigtapProcedure.findMany({
    where: procedureWhere(q),
    select: { code: true, name: true },
    orderBy: { code: "asc" },
    take: 20,
  });
  return NextResponse.json(results);
}
