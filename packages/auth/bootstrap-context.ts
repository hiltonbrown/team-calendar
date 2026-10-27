import "server-only";
import { consumeAuthContextRateLimit } from "./adapters/better-auth-server";
import {
  bootstrapCookieName,
  bootstrapInputSchema,
  bootstrapMaxAge,
  sealBootstrap,
} from "./bootstrap-proof";
import { parseBetterAuthEnvironment } from "./keys";
import { authContextMode } from "./selection";

export async function POST(request: Request): Promise<Response> {
  if (authContextMode() !== "local") {
    return new Response(null, { status: 404 });
  }
  const env = parseBetterAuthEnvironment();
  const { origin } = new URL(env.BETTER_AUTH_URL);
  if (request.headers.get("origin") !== origin) {
    return new Response(null, { status: 403 });
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return new Response(null, { status: 415 });
  }
  if (!(await consumeAuthContextRateLimit(request))) {
    return new Response(null, { status: 429 });
  }
  const body = await request.text();
  if (body.length > 2048) {
    return new Response(null, { status: 413 });
  }
  let input: import("zod").z.infer<typeof bootstrapInputSchema>;
  try {
    input = bootstrapInputSchema.parse(JSON.parse(body));
  } catch {
    return Response.json(
      { message: "Check your account setup details" },
      { status: 400 }
    );
  }
  const proof = sealBootstrap(
    { ...input, expiresAt: Date.now() + bootstrapMaxAge * 1000, version: 1 },
    env.BETTER_AUTH_SECRET
  );
  const secure = origin.startsWith("https:") ? "; Secure" : "";
  return Response.json(
    { status: true },
    {
      headers: {
        "cache-control": "no-store",
        "set-cookie": `${bootstrapCookieName(origin)}=${proof}; HttpOnly; SameSite=Lax; Path=/api/auth; Max-Age=${bootstrapMaxAge}${secure}`,
      },
    }
  );
}
