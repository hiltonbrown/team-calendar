import { describe, expect, it } from "vitest";
import { type AppName, runProductionPreflight } from "./preflight";

const SECRET_CANARY_VALUE = "secret_canary_value_123456789";

const validCommonVars = {
  NEXT_PUBLIC_API_URL: "https://api.teamcalendar.online",
  NEXT_PUBLIC_APP_URL: "https://app.teamcalendar.online",
  NEXT_PUBLIC_LAUNCH_MODE: "early_access",
  NEXT_PUBLIC_SENTRY_DSN: "https://sentrykey@o1234.ingest.sentry.io/5678",
  NEXT_PUBLIC_WEB_URL: "https://teamcalendar.online",
  SENTRY_AUTH_TOKEN: "sentry_auth_token_123",
  SENTRY_ORG: "team-calendar",
  SENTRY_PROJECT: "team-calendar-app",
};

const validAppVars = {
  XERO_APP_TIER: "starter",
  XERO_REDIRECT_URI: "https://api.teamcalendar.online/oauth/callback",
  ...validCommonVars,
  CLERK_SECRET_KEY: "clerk_sec_123456",
  DATABASE_APP_URL:
    "postgresql://team_calendar_app:test@localhost:5432/teamcalendar",
  DATABASE_URL:
    "postgresql://postgres:secretpassword@localhost:5432/teamcalendar",
  KV_REST_API_TOKEN: "kv_token_123",
  KV_REST_API_URL: "https://kv.upstash.io",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_123456",
  XERO_CLIENT_ID: "xero_client_id_123",
  XERO_CLIENT_SECRET: "xero_client_secret_123",
  XERO_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
};

const validApiVars = {
  ...validAppVars,
  EARLY_ACCESS_APPLICATION_HMAC_SECRET: "h".repeat(32),
  EARLY_ACCESS_APPLICATION_RECIPIENT: "admissions@teamcalendar.online",
  INNGEST_EVENT_KEY: "ingest_event_key_123",
  INNGEST_SIGNING_KEY: "signkey-prod-123",
  RESEND_FROM: "noreply@teamcalendar.online",
  RESEND_TOKEN: "re_123456789",
};

const validWebVars = {
  ...validCommonVars,
};

const validPaidVars = {
  STRIPE_PORTAL_RETURN_URL: "https://app.teamcalendar.online/settings/billing",
  STRIPE_PRICE_BASIC: "price_basic_123",
  STRIPE_PRICE_PREMIUM: "price_premium_123",
  STRIPE_SECRET_KEY: SECRET_CANARY_VALUE,
  STRIPE_WEBHOOK_SECRET: "whsec_stripe123",
};

describe("production preflight validation", () => {
  it("passes for valid early_access app deployment", () => {
    const result = runProductionPreflight({
      appName: "app",
      envVars: validAppVars,
    });
    expect(result.ok).toBe(true);
    expect(result.launchMode).toBe("early_access");
  });

  it("passes for valid early_access api deployment", () => {
    const result = runProductionPreflight({
      appName: "api",
      envVars: validApiVars,
    });
    expect(result.ok).toBe(true);
    expect(result.launchMode).toBe("early_access");
  });

  it("passes for valid early_access web deployment", () => {
    const result = runProductionPreflight({
      appName: "web",
      envVars: validWebVars,
    });
    expect(result.ok).toBe(true);
    expect(result.launchMode).toBe("early_access");
  });

  it("does not check a support email the web app never reads", () => {
    const result = runProductionPreflight({
      appName: "web",
      envVars: { ...validWebVars, SUPPORT_EMAIL: "not-an-email" },
    });
    expect(result.ok).toBe(true);
    expect(result.checkedVars).not.toContain("SUPPORT_EMAIL");
  });

  it("passes for valid paid app deployment when all Stripe keys exist", () => {
    const result = runProductionPreflight({
      appName: "app",
      envVars: {
        ...validAppVars,
        ...validPaidVars,
        NEXT_PUBLIC_LAUNCH_MODE: "paid",
      },
    });
    expect(result.ok).toBe(true);
    expect(result.launchMode).toBe("paid");
  });

  it("fails when NEXT_PUBLIC_LAUNCH_MODE is missing or invalid", () => {
    expect(() =>
      runProductionPreflight({
        appName: "app",
        envVars: { ...validAppVars, NEXT_PUBLIC_LAUNCH_MODE: "invalid" },
      })
    ).toThrow("NEXT_PUBLIC_LAUNCH_MODE is missing or invalid");
  });

  it("fails when NEXT_PUBLIC_LAUNCH_MODE is absent even with a CLI assertion", () => {
    const { NEXT_PUBLIC_LAUNCH_MODE: _mode, ...withoutMode } = validAppVars;
    expect(() =>
      runProductionPreflight({
        appName: "app",
        envVars: withoutMode,
        launchMode: "early_access",
      })
    ).toThrow("NEXT_PUBLIC_LAUNCH_MODE is missing or invalid");
  });

  it("fails when the actual mode conflicts with the CLI assertion", () => {
    expect(() =>
      runProductionPreflight({
        appName: "app",
        envVars: validAppVars,
        launchMode: "paid",
      })
    ).toThrow('CLI assertion expected "paid"');
  });

  it("fails when a required URL variable is not a valid URL", () => {
    expect(() =>
      runProductionPreflight({
        appName: "app",
        envVars: { ...validAppVars, NEXT_PUBLIC_APP_URL: "not-a-url" },
      })
    ).toThrow("NEXT_PUBLIC_APP_URL must be a valid URL");
  });

  it("fails atomically when KV credentials pair is half-configured", () => {
    const halfKv = { ...validAppVars, KV_REST_API_TOKEN: undefined };
    expect(() =>
      runProductionPreflight({
        appName: "app",
        envVars: halfKv,
      })
    ).toThrow("KV_REST_API_TOKEN is missing or empty");
  });

  it("fails atomically when Inngest credentials pair is half-configured on api", () => {
    const halfInngest = { ...validApiVars, INNGEST_SIGNING_KEY: undefined };
    expect(() =>
      runProductionPreflight({
        appName: "api",
        envVars: halfInngest,
      })
    ).toThrow(
      "INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY must be configured together"
    );
  });

  it("fails paid mode when Stripe keys are missing", () => {
    expect(() =>
      runProductionPreflight({
        appName: "app",
        envVars: { ...validAppVars, NEXT_PUBLIC_LAUNCH_MODE: "paid" },
      })
    ).toThrow("STRIPE_SECRET_KEY is missing or empty");
  });

  it("rejects RESEND_API_KEY when the runtime RESEND_TOKEN is absent", () => {
    expect(() =>
      runProductionPreflight({
        appName: "api",
        envVars: {
          ...validApiVars,
          RESEND_API_KEY: "re_alias_only",
          RESEND_TOKEN: undefined,
        },
      })
    ).toThrow("RESEND_TOKEN is missing or empty");
  });

  it("rejects an invalid Resend token and missing sender", () => {
    expect(() =>
      runProductionPreflight({
        appName: "api",
        envVars: {
          ...validApiVars,
          RESEND_FROM: undefined,
          RESEND_TOKEN: "invalid",
        },
      })
    ).toThrow("RESEND_TOKEN must start with re_");
  });

  it("rejects a missing or malformed Resend sender", () => {
    expect(() =>
      runProductionPreflight({
        appName: "api",
        envVars: { ...validApiVars, RESEND_FROM: undefined },
      })
    ).toThrow("RESEND_FROM is missing or empty");

    expect(() =>
      runProductionPreflight({
        appName: "api",
        envVars: { ...validApiVars, RESEND_FROM: "not-an-email" },
      })
    ).toThrow("RESEND_FROM must be a valid email address");
  });

  it("rejects a missing private application recipient", () => {
    expect(() =>
      runProductionPreflight({
        appName: "api",
        envVars: {
          ...validApiVars,
          EARLY_ACCESS_APPLICATION_RECIPIENT: undefined,
        },
      })
    ).toThrow("EARLY_ACCESS_APPLICATION_RECIPIENT is missing or empty");
  });

  it("accepts absent Better Stack configuration as disabled", () => {
    expect(
      runProductionPreflight({ appName: "web", envVars: validWebVars }).ok
    ).toBe(true);
  });

  for (const appName of ["app", "api", "web"] as const) {
    it(`rejects partial Better Stack configuration for ${appName}`, () => {
      expect(() =>
        runProductionPreflight({
          appName,
          envVars: {
            ...getValidVarsForApp(appName),
            BETTERSTACK_API_KEY: "token",
          },
        })
      ).toThrow("must be configured together");
    });
  }

  it("rejects a non-HTTPS Better Stack public URL", () => {
    expect(() =>
      runProductionPreflight({
        appName: "web",
        envVars: {
          ...validWebVars,
          BETTERSTACK_API_KEY: "token",
          BETTERSTACK_STATUS_PAGE_ID: "page-id",
          BETTERSTACK_STATUS_PAGE_URL: "http://status.teamcalendar.online",
        },
      })
    ).toThrow("BETTERSTACK_STATUS_PAGE_URL must be a valid HTTPS URL");
  });

  it("rejects incomplete Sentry source-map upload configuration", () => {
    expect(() =>
      runProductionPreflight({
        appName: "app",
        envVars: { ...validAppVars, SENTRY_AUTH_TOKEN: undefined },
      })
    ).toThrow("SENTRY_AUTH_TOKEN is missing or empty");
  });

  it("never prints or includes secret values in failure messages", () => {
    try {
      runProductionPreflight({
        appName: "app",
        envVars: {
          ...validAppVars,
          ...validPaidVars,
          NEXT_PUBLIC_APP_URL: "invalid-url",
          NEXT_PUBLIC_LAUNCH_MODE: "paid",
        },
      });
      expect.fail("Expected preflight to throw error");
    } catch (err) {
      const errorMsg = (err as Error).message;
      expect(errorMsg).not.toContain(SECRET_CANARY_VALUE);
      expect(errorMsg).not.toContain("secretpassword");
      expect(errorMsg).toContain("NEXT_PUBLIC_APP_URL must be a valid URL");
    }
  });

  const getValidVarsForApp = (appName: AppName) => {
    if (appName === "app") {
      return validAppVars;
    }
    if (appName === "api") {
      return validApiVars;
    }
    return validWebVars;
  };

  const apps: AppName[] = ["app", "api", "web"];
  for (const appName of apps) {
    it(`fails ${appName} when NEXT_PUBLIC_SENTRY_DSN is missing`, () => {
      const vars = {
        ...getValidVarsForApp(appName),
        NEXT_PUBLIC_SENTRY_DSN: "",
      };
      expect(() => runProductionPreflight({ appName, envVars: vars })).toThrow(
        "NEXT_PUBLIC_SENTRY_DSN is missing or empty"
      );
    });
  }
});

describe("shared Xero admission preflight", () => {
  for (const variable of [
    "XERO_APP_TIER",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
  ]) {
    it(`requires ${variable}`, () => {
      expect(() =>
        runProductionPreflight({
          appName: "app",
          envVars: { ...validAppVars, [variable]: undefined },
        })
      ).toThrow(`${variable} is missing or empty`);
    });
  }
  it("never prints configured store credentials in failures", () => {
    const secret = "do-not-print-this-store-token";
    let failure: unknown;
    try {
      runProductionPreflight({
        appName: "app",
        envVars: {
          ...validAppVars,
          KV_REST_API_TOKEN: secret,
          XERO_APP_TIER: undefined,
        },
      });
    } catch (error) {
      failure = error;
      expect(String(error)).not.toContain(secret);
      expect(String(error)).toContain("XERO_APP_TIER");
    }
    expect(failure).toBeInstanceOf(Error);
  });
});

describe("redirect production contract", () => {
  it.each(["XERO_REDIRECT_URI"])("reports missing %s", (name) => {
    expect(() =>
      runProductionPreflight({
        appName: "app",
        envVars: { ...validAppVars, [name]: undefined },
      })
    ).toThrow(name);
  });
  it("rejects non-HTTPS redirect without printing its value", () => {
    const value = "http://secret-canary.example/callback";
    try {
      runProductionPreflight({
        appName: "app",
        envVars: { ...validAppVars, XERO_REDIRECT_URI: value },
      });
      throw new Error("Expected rejection");
    } catch (error) {
      expect(String(error)).toContain("XERO_REDIRECT_URI");
      expect(String(error)).not.toContain(value);
    }
  });
});

describe("complete Xero configuration preflight", () => {
  const nextKey = Buffer.alloc(32, 2).toString("base64");
  it.each(["app", "api"] as const)(
    "preserves legacy version one for %s",
    (appName) => {
      const result = runProductionPreflight({
        appName,
        envVars: appName === "app" ? validAppVars : validApiVars,
      });
      expect(result.ok).toBe(true);
      expect(result.checkedVars).toContain(
        "XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION"
      );
      expect(result.checkedVars).toContain("XERO_TOKEN_ENCRYPTION_KEYS_JSON");
    }
  );
  it("accepts a mixed keyring with active version two", () => {
    expect(
      runProductionPreflight({
        appName: "api",
        envVars: {
          ...validApiVars,
          XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION: "2",
          XERO_TOKEN_ENCRYPTION_KEYS_JSON: JSON.stringify({
            "1": validAppVars.XERO_TOKEN_ENCRYPTION_KEY,
            "2": nextKey,
          }),
        },
      }).ok
    ).toBe(true);
  });
  it("uses the legacy key with a future optional keyring", () => {
    expect(
      runProductionPreflight({
        appName: "app",
        envVars: {
          ...validAppVars,
          XERO_TOKEN_ENCRYPTION_KEYS_JSON: JSON.stringify({ "2": nextKey }),
        },
      }).ok
    ).toBe(true);
  });
  it.each(["0", "-1", "1.5", "01", "9007199254740992", " 1 "])(
    "rejects invalid active version %s",
    (value) => {
      expect(() =>
        runProductionPreflight({
          appName: "app",
          envVars: {
            ...validAppVars,
            XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION: value,
          },
        })
      ).toThrow(
        "XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION must be a positive safe integer"
      );
    }
  );
  it.each([undefined, "{}", JSON.stringify({ "3": nextKey })])(
    "rejects a missing active key",
    (value) => {
      expect(() =>
        runProductionPreflight({
          appName: "api",
          envVars: {
            ...validApiVars,
            XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION: "2",
            XERO_TOKEN_ENCRYPTION_KEYS_JSON: value,
          },
        })
      ).toThrow(
        "XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION must resolve in XERO_TOKEN_ENCRYPTION_KEYS_JSON"
      );
    }
  );
  it.each([
    "{",
    "[]",
    "null",
    JSON.stringify({ "0": nextKey }),
    JSON.stringify({ "01": nextKey }),
    JSON.stringify({ "9007199254740992": nextKey }),
    JSON.stringify({ "2": "invalid-key" }),
    JSON.stringify({ "2": Buffer.alloc(31).toString("base64") }),
    JSON.stringify({ "2": 42 }),
  ])("rejects malformed keyrings", (value) => {
    expect(() =>
      runProductionPreflight({
        appName: "app",
        envVars: { ...validAppVars, XERO_TOKEN_ENCRYPTION_KEYS_JSON: value },
      })
    ).toThrow(
      "XERO_TOKEN_ENCRYPTION_KEYS_JSON must map positive safe integer versions to valid 32-byte base64 keys"
    );
  });
  it("rejects conflicting version-one keys", () => {
    expect(() =>
      runProductionPreflight({
        appName: "app",
        envVars: {
          ...validAppVars,
          XERO_TOKEN_ENCRYPTION_KEYS_JSON: JSON.stringify({ "1": nextKey }),
        },
      })
    ).toThrow(
      "XERO_TOKEN_ENCRYPTION_KEYS_JSON conflicts with XERO_TOKEN_ENCRYPTION_KEY for version 1"
    );
  });
  it.each(["invalid-key", Buffer.alloc(31).toString("base64"), ` ${nextKey} `])(
    "rejects malformed legacy keys",
    (value) => {
      expect(() =>
        runProductionPreflight({
          appName: "api",
          envVars: { ...validApiVars, XERO_TOKEN_ENCRYPTION_KEY: value },
        })
      ).toThrow(
        "XERO_TOKEN_ENCRYPTION_KEY must be a valid 32-byte base64-encoded string"
      );
    }
  );
  it.each(["starter", "core", "plus", "advanced", "enterprise"])(
    "accepts commercial tier %s",
    (value) => {
      expect(
        runProductionPreflight({
          appName: "app",
          envVars: { ...validAppVars, XERO_APP_TIER: value },
        }).ok
      ).toBe(true);
    }
  );
  it.each(["unknown", "Starter", " starter "])(
    "rejects unsupported commercial tiers",
    (value) => {
      expect(() =>
        runProductionPreflight({
          appName: "app",
          envVars: { ...validAppVars, XERO_APP_TIER: value },
        })
      ).toThrow("XERO_APP_TIER must be a supported commercial tier");
    }
  );
  it("reports variable names without supplied encryption or admission values", () => {
    let failure: unknown;
    try {
      runProductionPreflight({
        appName: "app",
        envVars: {
          ...validAppVars,
          XERO_APP_TIER: SECRET_CANARY_VALUE,
          XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION: SECRET_CANARY_VALUE,
          XERO_TOKEN_ENCRYPTION_KEY: SECRET_CANARY_VALUE,
          XERO_TOKEN_ENCRYPTION_KEYS_JSON: JSON.stringify({
            "2": SECRET_CANARY_VALUE,
          }),
        },
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).not.toContain(SECRET_CANARY_VALUE);
    for (const name of [
      "XERO_APP_TIER",
      "XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION",
      "XERO_TOKEN_ENCRYPTION_KEY",
      "XERO_TOKEN_ENCRYPTION_KEYS_JSON",
    ]) {
      expect(String(failure)).toContain(name);
    }
  });
  it("keeps Xero requirements out of marketing preflight", () => {
    const result = runProductionPreflight({
      appName: "web",
      envVars: validWebVars,
    });
    expect(result.ok).toBe(true);
    expect(
      result.checkedVars.filter((name) => name.startsWith("XERO_"))
    ).toEqual([]);
  });
});

it("requires restricted database URL for production app", () => {
  expect(() =>
    runProductionPreflight({
      appName: "app",
      envVars: { ...validAppVars, DATABASE_APP_URL: undefined },
    })
  ).toThrow("DATABASE_APP_URL");
});

describe("Better Auth production configuration", () => {
  const betterAuthVars = {
    ...validAppVars,
    AUTH_CONTEXT_MODE: "local",
    AUTH_PROVIDER: "better-auth",
    BETTER_AUTH_SECRET: "separate-better-auth-test-secret-32-characters",
    BETTER_AUTH_URL: validAppVars.NEXT_PUBLIC_APP_URL,
    CLERK_SECRET_KEY: undefined,
    GOOGLE_CLIENT_ID: "google-id",
    GOOGLE_CLIENT_SECRET: "google-secret",
    MICROSOFT_CLIENT_ID: "microsoft-id",
    MICROSOFT_CLIENT_SECRET: "microsoft-secret",
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: undefined,
    RESEND_FROM: "accounts@teamcalendar.online",
    RESEND_TOKEN: "re_auth-test",
    XERO_AUTH_CLIENT_ID: "sign-in-xero-id",
    XERO_AUTH_CLIENT_SECRET: "sign-in-xero-secret",
  };

  it("requires the selected app auth configuration without requiring Clerk", () => {
    const result = runProductionPreflight({
      appName: "app",
      envVars: betterAuthVars,
    });
    expect(result.ok).toBe(true);
    expect(result.checkedVars).toContain("BETTER_AUTH_SECRET");
    expect(result.checkedVars).not.toContain("CLERK_SECRET_KEY");
  });

  it("keeps auth secrets and social credentials out of API requirements", () => {
    const result = runProductionPreflight({
      appName: "api",
      envVars: {
        ...validApiVars,
        AUTH_CONTEXT_MODE: "remote",
        AUTH_PROVIDER: "better-auth",
        CLERK_SECRET_KEY: undefined,
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: undefined,
      },
    });
    expect(result.ok).toBe(true);
    expect(result.checkedVars).not.toContain("BETTER_AUTH_SECRET");
    expect(result.checkedVars).not.toContain("GOOGLE_CLIENT_SECRET");
    expect(result.checkedVars).not.toContain("CLERK_WEBHOOK_SECRET");
  });

  it("rejects a local auth context in the API", () => {
    expect(() =>
      runProductionPreflight({
        appName: "api",
        envVars: { ...validApiVars, AUTH_PROVIDER: "better-auth" },
      })
    ).toThrow("AUTH_CONTEXT_MODE must be remote");
  });

  it("rejects a remote auth context in the app", () => {
    expect(() =>
      runProductionPreflight({
        appName: "app",
        envVars: { ...betterAuthVars, AUTH_CONTEXT_MODE: "remote" },
      })
    ).toThrow("AUTH_CONTEXT_MODE");
  });

  it.each([
    "BETTER_AUTH_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "MICROSOFT_CLIENT_ID",
    "MICROSOFT_CLIENT_SECRET",
    "XERO_AUTH_CLIENT_ID",
    "XERO_AUTH_CLIENT_SECRET",
    "RESEND_FROM",
    "RESEND_TOKEN",
  ])("requires %s on the auth app", (name) => {
    expect(() =>
      runProductionPreflight({
        appName: "app",
        envVars: { ...betterAuthVars, [name]: undefined },
      })
    ).toThrow(name);
  });

  it.each([
    ["XERO_AUTH_CLIENT_ID", "XERO_CLIENT_ID"],
    ["XERO_AUTH_CLIENT_SECRET", "XERO_CLIENT_SECRET"],
  ] as const)("rejects payroll reuse for %s", (name, payrollName) => {
    expect(() =>
      runProductionPreflight({
        appName: "app",
        envVars: { ...betterAuthVars, [name]: betterAuthVars[payrollName] },
      })
    ).toThrow(`${name} must be separate`);
  });

  it("requires HTTPS even for an otherwise valid local origin", () => {
    expect(() =>
      runProductionPreflight({
        appName: "app",
        envVars: {
          ...betterAuthVars,
          BETTER_AUTH_URL: "http://localhost:3000",
          NEXT_PUBLIC_APP_URL: "http://localhost:3000",
        },
      })
    ).toThrow("BETTER_AUTH_URL must use HTTPS in production");
  });

  it("rejects unknown provider selection", () => {
    expect(() =>
      runProductionPreflight({
        appName: "app",
        envVars: { ...validAppVars, AUTH_PROVIDER: "unknown" },
      })
    ).toThrow("AUTH_PROVIDER");
  });

  it("requires the Infrastructure key only after explicit opt-in", () => {
    expect(() =>
      runProductionPreflight({
        appName: "app",
        envVars: { ...betterAuthVars, BETTER_AUTH_INFRA_ENABLED: "true" },
      })
    ).toThrow("BETTER_AUTH_API_KEY");
  });

  it("never echoes an invalid auth secret", () => {
    const secret = "auth-secret-canary";
    try {
      runProductionPreflight({
        appName: "app",
        envVars: { ...betterAuthVars, BETTER_AUTH_SECRET: secret },
      });
      expect.fail("Expected auth secret rejection");
    } catch (error) {
      expect(String(error)).toContain("BETTER_AUTH_SECRET");
      expect(String(error)).not.toContain(secret);
    }
  });

  for (const appName of ["app", "api"] as const) {
    const preview = {
      ...(appName === "app" ? betterAuthVars : validApiVars),
      AUTH_CONTEXT_MODE: appName === "app" ? "local" : "remote",
      AUTH_PROVIDER: "better-auth",
      BETTER_AUTH_URL:
        appName === "app" ? "https://app-preview.vercel.app" : undefined,
      NEXT_PUBLIC_API_URL: "https://api-preview.vercel.app",
      NEXT_PUBLIC_APP_URL: "https://app-preview.vercel.app",
      TC_API_CANDIDATE_URL: "https://api-preview.vercel.app",
      TC_APP_CANDIDATE_URL: "https://app-preview.vercel.app",
      VERCEL_ENV: "preview",
    };

    it(`accepts the exact Preview app/API pair for ${appName}`, () => {
      expect(runProductionPreflight({ appName, envVars: preview }).ok).toBe(
        true
      );
    });

    it.each(["TC_APP_CANDIDATE_URL", "TC_API_CANDIDATE_URL"])(
      `rejects missing %s for Preview ${appName}`,
      (name) => {
        expect(() =>
          runProductionPreflight({
            appName,
            envVars: { ...preview, [name]: undefined },
          })
        ).toThrow("Preview auth requires an exact app/API candidate pair");
      }
    );

    it.each([
      "TC_APP_CANDIDATE_URL",
      "TC_API_CANDIDATE_URL",
      "NEXT_PUBLIC_API_URL",
    ])(`rejects mismatched %s for Preview ${appName}`, (name) => {
      expect(() =>
        runProductionPreflight({
          appName,
          envVars: { ...preview, [name]: "https://different.vercel.app" },
        })
      ).toThrow("Preview auth requires an exact app/API candidate pair");
    });
  }
});
