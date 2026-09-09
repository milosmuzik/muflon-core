import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { error: "Automatická revize je vypnutá. Použij /kontrola." },
    { status: 410 },
  );
}
