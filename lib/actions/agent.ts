"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { vygenerovatNavrhyKalendare, type VysledekAgenta } from "@/lib/agent/navrhy-kalendar";

export async function spustitAgentaRucne(
  _predchoziStav: VysledekAgenta,
  _formData: FormData
): Promise<VysledekAgenta> {
  const vysledek = await vygenerovatNavrhyKalendare(7);
  revalidatePath("/udalosti");
  return vysledek;
}

export async function prepnoutZverejneni(id: string, aktualniStav: boolean) {
  await prisma.udalost.update({
    where: { id },
    data: { zverejnitNaSitich: !aktualniStav },
  });
  revalidatePath("/udalosti");
  revalidatePath(`/udalosti/${id}`);
}
