import "server-only";

import { isAPIError } from "better-auth/api";
import { z } from "zod";
import {
  AccountDirectoryError,
  acceptAccountInvitation,
} from "./adapters/better-auth-accounts";
import { consumeAuthContextRateLimit } from "./adapters/better-auth-server";
import { getAuthOrigins } from "./cookie-transport";
import { authContextMode, authProvider } from "./selection";

export async function POST(
  request: Request,
  context: { params: Promise<{ invitationId: string }> }
): Promise<Response> {
  if (authProvider() !== "better-auth" || authContextMode() !== "local") {
    return new Response(null, { status: 404 });
  }
  if (request.headers.get("origin") !== getAuthOrigins().appOrigin) {
    return new Response(null, { status: 403 });
  }
  if (!(await consumeAuthContextRateLimit(request))) {
    return new Response(null, {
      headers: { "retry-after": "60" },
      status: 429,
    });
  }
  try {
    const { invitationId } = await context.params;
    z.uuid().parse(invitationId);
    const result = await acceptAccountInvitation(invitationId, request.headers);
    const responseHeaders = new Headers({
      "cache-control": "no-store, private",
    });
    for (const value of result.responseHeaders.getSetCookie()) {
      responseHeaders.append("set-cookie", value);
    }
    return Response.json(
      { accountId: result.accountId },
      { headers: responseHeaders }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { message: "This invitation is invalid" },
        { status: 400 }
      );
    }
    if (error instanceof AccountDirectoryError) {
      return Response.json(
        { message: error.message },
        { status: error.status }
      );
    }
    if (
      isAPIError(error) &&
      [400, 401, 403, 404, 409, 429].includes(error.statusCode)
    ) {
      return Response.json(
        {
          message:
            "This invitation cannot be accepted. Check that you signed in with the invited email.",
        },
        { status: error.statusCode }
      );
    }
    return Response.json(
      { message: "The invitation could not be accepted. Try again." },
      { status: 500 }
    );
  }
}
