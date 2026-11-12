import { createHealthResponse } from "@opero/shared";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(createHealthResponse("web"));
}
