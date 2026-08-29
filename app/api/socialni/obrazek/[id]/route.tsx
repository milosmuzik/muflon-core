import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";

function formatujDatum(datum: string): string {
  const shodaPlne = datum.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (shodaPlne) {
    const [, rok, mesic, den] = shodaPlne;
    return `${den}-${mesic}-${rok}`;
  }
  const shodaKratka = datum.match(/^(\d{2})-(\d{2})$/);
  if (shodaKratka) {
    const [, mesic, den] = shodaKratka;
    return `${den}-${mesic}-${new Date().getFullYear()}`;
  }
  return datum;
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const udalost = await prisma.udalost.findUnique({ where: { id: params.id } });
  if (!udalost) {
    return new Response("Nenalezeno", { status: 404 });
  }

  const TYP_ZNACKA: Record<string, string> = {
    vyroci_alba: "VÝROČÍ ALBA",
    narozeniny: "NAROZENINY",
    umrti: "VZPOMÍNKA",
    jina: "TOHLE SE STALO",
  };

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          backgroundImage: udalost.fotoUrl
            ? `url(${udalost.fotoUrl})`
            : "radial-gradient(circle at 25% 15%, #4a2f0d 0%, #1a1206 40%, #0a0a0a 78%)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            background: udalost.fotoUrl
              ? "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0.92) 100%)"
              : "linear-gradient(to top, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.1) 55%, rgba(0,0,0,0.25) 100%)",
          }}
        />
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "100%",
            height: "100%",
            padding: 64,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", width: "100%" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 30, fontWeight: 700, color: "#D9A441", letterSpacing: 3 }}>RÁDIO MUFLON</span>
              <span style={{ fontSize: 20, fontWeight: 500, color: "#E7E2D6", letterSpacing: 2, marginTop: 4 }}>
                MUFLONÍ KALENDÁŘ
              </span>
            </div>
            <div
              style={{
                display: "flex",
                background: "#D9A441",
                color: "#14181C",
                padding: "12px 22px",
                borderRadius: 4,
                fontSize: 26,
                fontWeight: 700,
              }}
            >
              {formatujDatum(udalost.datum)}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 900 }}>
            <div style={{ display: "flex", width: 64, height: 6, background: "#D9A441", borderRadius: 3 }} />
            <span style={{ fontSize: 22, fontWeight: 700, color: "#D9A441", letterSpacing: 3 }}>
              {TYP_ZNACKA[udalost.typ] ?? TYP_ZNACKA.jina}
            </span>
            <span style={{ fontSize: 64, fontWeight: 800, color: "#ffffff", lineHeight: 1.1 }}>
              {udalost.nazev}
            </span>
            <span style={{ fontSize: 20, fontWeight: 600, color: "#D9A441", marginTop: 8 }}>radiomuflon.cz</span>
          </div>
        </div>
      </div>
    ),
    { width: 1080, height: 1080 }
  );
}
