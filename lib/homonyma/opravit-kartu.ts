import type { PrismaClient } from "@prisma/client";
import {
  jeCiziVanaheimText,
  VANAHEIM_ALBA_CZ,
  VANAHEIM_HISTORIE_CZ,
  VANAHEIM_REDAKCNI_VYZNAM_CZ,
  VANAHEIM_SESTAVA_CZ,
  VANAHEIM_SKLADBY_CZ,
} from "./vanaheim";

function norm(text: string): string {
  return text.trim().toLowerCase();
}

export type VysledekOpravyVanaheimu = {
  interpretId: string;
  smazanoClenstvi: number;
  pridanoClenstvi: number;
  odpojenoAlb: number;
  pridanoAlb: number;
  odpojenoSkladeb: number;
  smazanoVazeb: number;
  smazanoZdroju: number;
  archivovanoPribehu: number;
};

export async function opravitKartuVanaheimu(
  prisma: PrismaClient,
  interpretId?: string,
): Promise<VysledekOpravyVanaheimu[]> {
  const interpreti = interpretId
    ? await prisma.interpret.findMany({ where: { id: interpretId } })
    : await prisma.interpret.findMany({
        where: { nazev: { equals: "Vanaheim", mode: "insensitive" } },
      });

  const vysledky: VysledekOpravyVanaheimu[] = [];

  for (const interpret of interpreti) {
    await prisma.interpret.update({
      where: { id: interpret.id },
      data: {
        zeme: "Česko",
        mesto: "Chlumec nad Cidlinou",
        rokVzniku: interpret.rokVzniku ?? 2015,
        zanry: "heavy metal, power metal, viking metal",
        historie: VANAHEIM_HISTORIE_CZ,
        redakcniVyznam: VANAHEIM_REDAKCNI_VYZNAM_CZ,
        poznamka: null,
        urovenKarty: "referencni",
        stav: "aktivni",
        typ: "kapela",
      },
    });

    const clenstvi = await prisma.clenstvi.findMany({
      where: { interpretId: interpret.id },
      include: { hudebnik: true },
    });
    const ciziClenstvi = clenstvi.filter((c) => jeCiziVanaheimText(c.hudebnik.jmeno));
    if (ciziClenstvi.length > 0) {
      await prisma.clenstvi.deleteMany({ where: { id: { in: ciziClenstvi.map((c) => c.id) } } });
    }

    const zustava = await prisma.clenstvi.findMany({
      where: { interpretId: interpret.id },
      include: { hudebnik: true },
    });
    const mame = new Set(zustava.map((c) => norm(c.hudebnik.jmeno)));
    let pridanoClenstvi = 0;
    for (const clen of VANAHEIM_SESTAVA_CZ) {
      if (mame.has(norm(clen.jmeno))) continue;
      let hudebnik = await prisma.hudebnik.findFirst({ where: { jmeno: { equals: clen.jmeno, mode: "insensitive" } } });
      if (!hudebnik) {
        hudebnik = await prisma.hudebnik.create({ data: { jmeno: clen.jmeno } });
      }
      await prisma.clenstvi.create({
        data: {
          interpretId: interpret.id,
          hudebnikId: hudebnik.id,
          role: clen.role,
          nastroj: clen.nastroj,
          obdobiOd: clen.obdobiOd,
          obdobiDo: clen.obdobiDo,
        },
      });
      mame.add(norm(clen.jmeno));
      pridanoClenstvi += 1;
    }

    const albaVazby = await prisma.albumInterpret.findMany({
      where: { interpretId: interpret.id },
      include: { album: true },
    });
    const ciziAlba = albaVazby.filter((a) => jeCiziVanaheimText(a.album.nazev));
    if (ciziAlba.length > 0) {
      await prisma.albumInterpret.deleteMany({ where: { id: { in: ciziAlba.map((a) => a.id) } } });
    }
    const albaPo = await prisma.albumInterpret.findMany({
      where: { interpretId: interpret.id },
      include: { album: true },
    });
    const albaMame = new Set(albaPo.map((a) => norm(a.album.nazev)));
    let pridanoAlb = 0;
    for (const album of VANAHEIM_ALBA_CZ) {
      if (albaMame.has(norm(album.nazev))) continue;
      let exist = await prisma.album.findFirst({ where: { nazev: { equals: album.nazev, mode: "insensitive" } } });
      if (!exist) {
        exist = await prisma.album.create({
          data: { nazev: album.nazev, datumVydani: album.datumVydani },
        });
      }
      await prisma.albumInterpret.create({
        data: { interpretId: interpret.id, albumId: exist.id },
      });
      pridanoAlb += 1;
    }

    const skladbyVazby = await prisma.skladbaInterpret.findMany({
      where: { interpretId: interpret.id },
      include: { skladba: true },
    });
    const ceskeSkladby = new Set(VANAHEIM_SKLADBY_CZ.map(norm));
    const ciziSkladby = skladbyVazby.filter(
      (s) => jeCiziVanaheimText(s.skladba.nazev) || !ceskeSkladby.has(norm(s.skladba.nazev)),
    );
    // Playlistové české názvy necháme; odpojíme jen cizí stopu.
    const kOdpojeni = skladbyVazby.filter((s) => jeCiziVanaheimText(s.skladba.nazev));
    if (kOdpojeni.length > 0) {
      await prisma.skladbaInterpret.deleteMany({ where: { id: { in: kOdpojeni.map((s) => s.id) } } });
    }

    const vazby = await prisma.vazba.findMany({
      where: {
        OR: [
          { zdrojovyTyp: "Interpret", zdrojovyId: interpret.id },
          { cilovyTyp: "Interpret", cilovyId: interpret.id },
        ],
      },
    });
    const ciziVazby = vazby.filter((v) => jeCiziVanaheimText(`${v.typVztahu} ${v.poznamka ?? ""}`));
    if (ciziVazby.length > 0) {
      await prisma.vazba.deleteMany({ where: { id: { in: ciziVazby.map((v) => v.id) } } });
    }

    const zdroje = await prisma.zdroj.findMany({
      where: { cilovyTyp: "Interpret", cilovyId: interpret.id },
    });
    const ciziZdroje = zdroje.filter((z) => jeCiziVanaheimText(`${z.nazev} ${z.url ?? ""} ${z.poznamka ?? ""}`));
    if (ciziZdroje.length > 0) {
      await prisma.zdroj.deleteMany({ where: { id: { in: ciziZdroje.map((z) => z.id) } } });
    }

    const pribehVazby = await prisma.vazba.findMany({
      where: { zdrojovyTyp: "Pribeh", cilovyTyp: "Interpret", cilovyId: interpret.id },
    });
    let archivovanoPribehu = 0;
    if (pribehVazby.length > 0) {
      const pribehy = await prisma.pribeh.findMany({
        where: { id: { in: pribehVazby.map((v) => v.zdrojovyId) } },
      });
      const ciziPribehy = pribehy.filter((p) => jeCiziVanaheimText(`${p.nadpis} ${p.obsah}`));
      for (const p of ciziPribehy) {
        await prisma.pribeh.update({ where: { id: p.id }, data: { stav: "archivovano" } });
        await prisma.vazba.deleteMany({
          where: { zdrojovyTyp: "Pribeh", zdrojovyId: p.id, cilovyTyp: "Interpret", cilovyId: interpret.id },
        });
        archivovanoPribehu += 1;
      }
    }

    const udalosti = await prisma.udalost.findMany({
      where: { nazev: { contains: "Vanaheim", mode: "insensitive" } },
    });
    for (const u of udalosti) {
      if (jeCiziVanaheimText(`${u.nazev} ${u.popis ?? ""}`)) {
        await prisma.udalost.update({ where: { id: u.id }, data: { stav: "archivovano" } });
      }
    }

    await prisma.historieZmeny.create({
      data: {
        entitaTyp: "Interpret",
        entitaId: interpret.id,
        akce: "upraveno",
        popis: "Karta Vanaheim přepsána na českou kapelu z Chlumce nad Cidlinou včetně sestavy, alb a vazeb.",
      },
    });

    vysledky.push({
      interpretId: interpret.id,
      smazanoClenstvi: ciziClenstvi.length,
      pridanoClenstvi,
      odpojenoAlb: ciziAlba.length,
      pridanoAlb,
      odpojenoSkladeb: kOdpojeni.length,
      smazanoVazeb: ciziVazby.length,
      smazanoZdroju: ciziZdroje.length,
      archivovanoPribehu,
    });
  }

  return vysledky;
}
