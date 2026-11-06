import { randomBytes } from "node:crypto";
import type { Prisma, PrismaClient } from "@repo/database";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization } from "better-auth/plugins";
import { z } from "zod";
import { accessControl, organizationRoles } from "./better-auth-permissions";
import { coreSchemaOptions, organizationSchema } from "./better-auth-schema";
import type { AuthRole } from "./permissions";

export const developmentSeedMarker = "team-calendar-development-v1";
export const developmentSeedRoles = [
  "owner",
  "admin",
  "manager",
  "viewer",
] as const;
export const developmentSeedCountries = [
  { code: "AU", timeZone: "Australia/Brisbane" },
  { code: "NZ", timeZone: "Pacific/Auckland" },
  { code: "UK", timeZone: "Europe/London" },
] as const;
export type DevelopmentSeedCountry = (typeof developmentSeedCountries)[number];
export interface DevelopmentSeedAccount {
  accountId: string;
  country: DevelopmentSeedCountry["code"];
  timeZone: string;
  users: { email: string; role: AuthRole; userId: string }[];
}
const marker = z.object({ developmentSeed: z.literal(developmentSeedMarker) });
const passwordSchema = z.string().min(12).max(128);
const emailFor = (country: string, role: AuthRole) =>
  `${role}.${country.toLowerCase()}@teamcalendar.test`;
const slugFor = (country: string) =>
  `team-calendar-seed-${country.toLowerCase()}`;

function assertOwnedAccount(
  account: { country_code: string; metadata: string | null },
  country: string
) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(account.metadata ?? "{}");
  } catch (cause) {
    throw new Error("Seed Account metadata is invalid", { cause });
  }
  if (!marker.safeParse(parsed).success || account.country_code !== country) {
    throw new Error(
      "Refusing to adopt an Account not owned by this development seed"
    );
  }
}

async function seedUser(
  tx: Prisma.TransactionClient,
  country: DevelopmentSeedCountry,
  role: AuthRole,
  password: string
) {
  let account = await tx.authOrganization.findUnique({
    where: { slug: slugFor(country.code) },
  });
  if (account) {
    assertOwnedAccount(account, country.code);
  }
  const email = emailFor(country.code, role);
  const existing = await tx.authUser.findUnique({
    include: { memberships: true },
    where: { email },
  });
  if (
    existing &&
    (!account ||
      existing.memberships.length !== 1 ||
      existing.memberships[0].account_id !== account.id ||
      existing.memberships[0].role !== role)
  ) {
    throw new Error(
      "Refusing to adopt or rewrite a user not owned by this development seed"
    );
  }
  if (role !== "owner" && !account) {
    throw new Error("Seed owner Account must exist before its members");
  }
  let verificationUrl: string | undefined;
  let bootstrap = (_userId: string): Promise<void> => {
    throw new Error("Seed auth bootstrap is not initialised");
  };
  // This runtime is never mounted as an HTTP handler. All native reads, including
  // ctx.context.adapter reads, are bound to the enclosing real Prisma transaction.
  const auth = betterAuth({
    ...coreSchemaOptions,
    advanced: { database: { generateId: "uuid" } },
    baseURL: "http://localhost:3000",
    database: prismaAdapter(tx, { provider: "postgresql", transaction: false }),
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await bootstrap(user.id);
          },
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      maxPasswordLength: 128,
      minPasswordLength: 12,
      requireEmailVerification: true,
    },
    emailVerification: {
      autoSignInAfterVerification: false,
      sendOnSignUp: true,
      sendVerificationEmail: ({ url }) => {
        verificationUrl = url;
        return Promise.resolve();
      },
    },
    plugins: [
      organization({
        ac: accessControl,
        creatorRole: "owner",
        roles: organizationRoles,
        schema: organizationSchema,
        teams: { enabled: false },
      }),
    ],
    rateLimit: { enabled: false },
    secret: randomBytes(48).toString("base64url"),
    telemetry: { enabled: false },
  });
  bootstrap = async (userId) => {
    if (account) {
      await auth.api.addMember({
        body: { organizationId: account.id, role, userId },
      });
    } else {
      const created = await auth.api.createOrganization({
        body: {
          countryCode: country.code,
          metadata: {
            bootstrapTimeZone: country.timeZone,
            bootstrapUserId: userId,
            developmentSeed: developmentSeedMarker,
          },
          name: `Team Calendar ${country.code} test Account`,
          slug: slugFor(country.code),
          userId,
        },
      });
      if (!created) {
        throw new Error("Better Auth did not create the seed Account");
      }
      account = await tx.authOrganization.findUnique({
        where: { id: created.id },
      });
    }
  };
  if (!existing) {
    await auth.api.signUpEmail({
      body: { email, name: `${country.code} ${role}`, password },
    });
  }
  if (!existing?.email_verified) {
    if (!verificationUrl && existing) {
      await auth.api.sendVerificationEmail({ body: { email } });
    }
    const token = verificationUrl
      ? new URL(verificationUrl).searchParams.get("token")
      : null;
    if (!token) {
      throw new Error(
        "Better Auth did not issue the local fixture verification token"
      );
    }
    await auth.api.verifyEmail({ query: { token } });
  }
  const signedIn = await auth.api.signInEmail({
    body: { email, password },
    returnHeaders: true,
  });
  const cookie = signedIn.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  if (!(cookie && signedIn.response.user.emailVerified && account)) {
    throw new Error("Seed user verification failed");
  }
  await auth.api.signOut({ headers: new Headers({ cookie }) });
  return {
    accountId: account.id,
    email,
    role,
    userId: signedIn.response.user.id,
  };
}

/** Trusted standalone fixture tooling; no production auth or country policy changes. */
export async function seedDevelopmentAuthAccounts(
  db: PrismaClient,
  input: { password: string }
): Promise<DevelopmentSeedAccount[]> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Development auth seed cannot run in production");
  }
  const password = passwordSchema.parse(input.password);
  const accounts: DevelopmentSeedAccount[] = [];
  for (const country of developmentSeedCountries) {
    const users: DevelopmentSeedAccount["users"] = [];
    let accountId: string | undefined;
    for (const role of developmentSeedRoles) {
      const user = await db.$transaction(
        (tx) => seedUser(tx, country, role, password),
        { maxWait: 10_000, timeout: 30_000 }
      );
      ({ accountId } = user);
      users.push({ email: user.email, role, userId: user.userId });
    }
    if (!accountId) {
      throw new Error("Seed Account was not created");
    }
    accounts.push({
      accountId,
      country: country.code,
      timeZone: country.timeZone,
      users,
    });
  }
  return accounts;
}
