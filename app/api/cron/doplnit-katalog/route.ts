import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { error: "Automatický import je vypnutý. Použij /kontrola." },
    { status: 410 },
  );
}
