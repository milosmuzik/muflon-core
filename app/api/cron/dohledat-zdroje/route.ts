import { NextRequest, NextResponse } from "next/server";
import { dohledatChybejiciZdroje } from "@/lib/agent/dohledat-zdroje-hromadne";

export const maxDuration = 60;

// Denní automatický běh AI fact-checkeru (viz "Dohledat zdroje" na
// /kontrola) - dřív šlo jen ručně po dávkách po 5, což by frontu
// příběhů/událostí bez zdroje čistilo měsíce klikání. Větší dávka než
// ruční tlačítko, protože cron nemá čekajícího uživatele na druhé straně.
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
