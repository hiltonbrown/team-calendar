import { functions, inngest } from "@repo/jobs";
import { serve } from "inngest/next";

export const maxDuration = 300;

const handlers = serve({
  client: inngest,
  functions,
});

type InngestRequest = Parameters<typeof handlers.GET>[0];

export function GET(request: Request): Promise<Response> {
  // Inngest and Next can resolve separate NextRequest instances under Bun.
  return handlers.GET(request as unknown as InngestRequest, undefined);
}

export function POST(request: Request): Promise<Response> {
  // Inngest and Next can resolve separate NextRequest instances under Bun.
  return handlers.POST(request as unknown as InngestRequest, undefined);
}

export function PUT(request: Request): Promise<Response> {
  // Inngest and Next can resolve separate NextRequest instances under Bun.
  return handlers.PUT(request as unknown as InngestRequest, undefined);
}
