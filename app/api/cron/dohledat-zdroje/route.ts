import { NextRequest, NextResponse } from "next/server";
import { dohledatChybejiciZdroje } from "@/lib/agent/dohledat-zdroje-hromadne";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const hlavicka = request.headers.get("authorization");
  if (hlavicka !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Neautorizováno" }, { status: 401 });
  }

  try {
    const vysledek = await dohledatChybejiciZdroje(8);
    return NextResponse.json(vysledek);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
