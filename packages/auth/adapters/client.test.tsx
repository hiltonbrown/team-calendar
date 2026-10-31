import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  listAccounts,
  safeAuthReturnTo,
  setActiveAccount,
  signInMagicLink,
  signInSocial,
  signUpEmail,
  useActiveOrganization,
  useSession,
} from "../client";

const mocks = vi.hoisted(() => ({
  active: vi.fn(),
  email: vi.fn(),
  fetch: vi.fn(),
  list: vi.fn(),
  magicLink: vi.fn(),
  member: vi.fn(),
  organizations: vi.fn(),
  session: vi.fn(),
  setActive: vi.fn(),
  signup: vi.fn(),
  social: vi.fn(),
}));
vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({
    organization: { list: mocks.list, setActive: mocks.setActive },
    signIn: {
      email: mocks.email,
      magicLink: mocks.magicLink,
      social: mocks.social,
    },
    signUp: { email: mocks.signup },
    useActiveMember: mocks.member,
    useActiveOrganization: mocks.active,
    useListOrganizations: mocks.organizations,
    useSession: mocks.session,
  }),
}));

// View components are exercised with the app React renderer.
vi.mock("../components/account-user-menu", () => ({
  AccountUserMenu: () => null,
  SignOutButton: () => null,
}));

const account = {
  countryCode: "AU",
  id: "account",
  logo: null,
  name: "Acme",
  provisioningStatus: "ready",
  slug: "acme",
};

describe("neutral Better Auth client facade", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.fetch.mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.session.mockReturnValue({
      data: {
        session: {
          activeOrganizationId: "account",
          id: "session",
          token: "private",
          userId: "user",
        },
        user: {
          email: "user@example.test",
          emailVerified: true,
          id: "user",
          image: null,
          name: "Person",
          password: "private",
        },
      },
      error: null,
      isPending: false,
    });
    mocks.member.mockReturnValue({
      data: { organizationId: "account", role: "manager", userId: "user" },
      error: null,
      isPending: false,
    });
    mocks.active.mockReturnValue({
      data: { ...account, members: [{ userId: "other" }], metadata: "private" },
      error: null,
      isPending: false,
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("projects only safe session/user fields and verifies current membership", () => {
    expect(useSession()).toMatchObject({
      isLoaded: true,
      session: {
        accountId: "account",
        role: "manager",
        sessionId: "session",
        userId: "user",
      },
      user: { emailVerified: true, id: "user" },
    });
    expect(JSON.stringify(useSession())).not.toContain("private");
    mocks.member.mockReturnValue({
      data: { organizationId: "account", role: "owner", userId: "other" },
      error: null,
      isPending: false,
    });
    expect(useSession().session).toMatchObject({ accountId: null, role: null });
  });
  it("denies unknown roles and waits for membership instead of guessing", () => {
    mocks.member.mockReturnValue({
      data: { organizationId: "account", role: "invented", userId: "user" },
      error: null,
      isPending: false,
    });
    expect(useSession().session).toMatchObject({ accountId: null, role: null });
    mocks.member.mockReturnValue({ data: null, error: null, isPending: true });
    expect(useSession()).toMatchObject({ isLoaded: false, session: null });
    mocks.session.mockReturnValue({
      data: null,
      error: null,
      isPending: false,
    });
    expect(useSession()).toMatchObject({
      isLoaded: true,
      session: null,
      user: null,
    });
  });
  it("projects the active Account without member identities or metadata", () => {
    expect(useActiveOrganization().organization).toEqual({
      countryCode: "AU",
      id: "account",
      image: null,
      name: "Acme",
      provisioningStatus: "ready",
      slug: "acme",
    });
  });
  it.each([
    "https://untrusted.example",
    "//untrusted.example",
    "/\\untrusted.example",
    "/%2f%2funtrusted.example",
    "/%5cuntrusted.example",
    "/\nwrong",
  ])("rejects unsafe return path %s", (value) => {
    expect(safeAuthReturnTo(value)).toBe("/");
  });
  it("retains a local destination with its query and fragment", () => {
    expect(safeAuthReturnTo("/calendar?view=week#today")).toBe(
      "/calendar?view=week#today"
    );
    expect(safeAuthReturnTo(undefined, "/select-account")).toBe(
      "/select-account"
    );
  });
  it("prepares AU/browser timezone context before each first-user sign-in method", async () => {
    for (const method of [mocks.signup, mocks.social, mocks.magicLink]) {
      method.mockResolvedValue({
        data: { status: true, token: "private" },
        error: null,
      });
    }
    expect(
      await signUpEmail({
        callbackURL: "/select-account",
        email: "user@example.test",
        invitationId: "invite",
        name: "Person",
        password: "a sufficiently long password",
      })
    ).toEqual({ data: { status: true }, error: null });
    await signInSocial({
      callbackURL: "/select-account",
      provider: "xero-auth",
    });
    await signInMagicLink({
      callbackURL: "/select-account",
      email: "user@example.test",
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
    const [url, options] = mocks.fetch.mock.calls[0];
    expect(url).toBe("/api/auth/bootstrap-context");
    expect(JSON.parse(options.body)).toMatchObject({
      countryCode: "AU",
      invitationId: "invite",
      timeZone: expect.any(String),
    });
    expect(mocks.signup).toHaveBeenCalledWith({
      callbackURL: "/select-account",
      email: "user@example.test",
      name: "Person",
      password: "a sufficiently long password",
    });
  });
  it("does not start auth when signup context cannot be prepared", async () => {
    mocks.fetch.mockResolvedValue(new Response(null, { status: 403 }));
    expect(
      (await signInMagicLink({ email: "user@example.test" })).error
    ).not.toBeNull();
    expect(mocks.magicLink).not.toHaveBeenCalled();
  });
  it("switches the exact selected Account and rejects an inconsistent response", async () => {
    mocks.setActive.mockResolvedValue({ data: account, error: null });
    expect(await setActiveAccount("account")).toMatchObject({
      data: { id: "account" },
      error: null,
    });
    expect(mocks.setActive).toHaveBeenCalledWith({ organizationId: "account" });
    mocks.setActive.mockResolvedValue({
      data: { ...account, id: "other" },
      error: null,
    });
    expect((await setActiveAccount("account")).error).not.toBeNull();
  });
  it("returns only projected Accounts from the current user's native list", async () => {
    mocks.list.mockResolvedValue({
      data: [{ ...account, metadata: "private" }],
      error: null,
    });
    expect(await listAccounts()).toMatchObject({
      data: [{ id: "account", name: "Acme" }],
      error: null,
    });
    expect(JSON.stringify(await listAccounts())).not.toContain("private");
  });
});
