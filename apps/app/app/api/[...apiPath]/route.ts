import { proxyApiRequest } from "@repo/auth/transport";

export const GET = proxyApiRequest;
export const POST = proxyApiRequest;
export const PATCH = proxyApiRequest;
export const DELETE = proxyApiRequest;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
