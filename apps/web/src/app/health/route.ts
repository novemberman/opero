import { createHealthResponse } from "@opero/shared";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const version =
    process.env.APP_VERSION ?? process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.npm_package_version;
  return NextResponse.json(createHealthResponse("web", new Date(), version));
}
