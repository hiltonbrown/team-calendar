import { z } from "zod";

export const authProvider = () =>
  z.enum(["clerk", "better-auth"]).parse(process.env.AUTH_PROVIDER ?? "clerk");

export const authContextMode = () =>
  z.enum(["local", "remote"]).parse(process.env.AUTH_CONTEXT_MODE ?? "local");
