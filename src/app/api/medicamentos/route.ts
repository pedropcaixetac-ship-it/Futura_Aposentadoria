import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { normalizeText, searchMedications } from "@/lib/medicamentos";

// Sugestões de medicamento enquanto o médico digita, igual à busca do CID.
// Primeiro o que a farmácia do hospital tem cadastrado; depois a lista comum.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json([], { status: 401 });

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (normalizeText(q).length < 2) return NextResponse.json([]);

  const first = normalizeText(q).split(/\s+/)[0];
  const products = await prisma.pharmacyProduct.findMany({
    where: { clinicId: user.clinicId, active: true },
    select: { name: true, presentation: true },
    orderBy: { name: "asc" },
    take: 2000,
  });
  const pharmacy = products
    .filter((p) => normalizeText(`${p.name} ${p.presentation ?? ""}`).includes(first))
    .map((p) => ({ name: p.name, presentation: p.presentation ?? "", route: "" }));

  return NextResponse.json(searchMedications(q, pharmacy));
}
