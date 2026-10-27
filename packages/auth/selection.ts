import { z } from "zod";

export const authContextMode = () =>
  z.enum(["local", "remote"]).parse(process.env.AUTH_CONTEXT_MODE ?? "local");
