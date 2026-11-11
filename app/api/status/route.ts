import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    aiConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    shoppingConfigured: Boolean(process.env.SERPAPI_API_KEY),
  });
}
