import { AccountPicker } from "@repo/auth/components/account-picker";
import { safeAuthReturnTo } from "@repo/auth/redirects";
import { getCurrentUser, getSession } from "@repo/auth/server";
import { createMetadata } from "@repo/seo/metadata";
import { redirect } from "next/navigation";

export const metadata = createMetadata({
  description: "Choose the Team Calendar account you want to use.",
  title: "Choose an account",
});

const SelectAccountPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) => {
  const params = await searchParams;
  const returnTo = safeAuthReturnTo(
    typeof params.returnTo === "string" ? params.returnTo : undefined
  );
  const session = await getSession();
  const user = await getCurrentUser();
  if (!(session && user && session.userId === user.id)) {
    redirect(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  }
  if (!user.emailVerified) {
    redirect("/verify-email");
  }
  return <AccountPicker returnTo={returnTo} />;
};

export default SelectAccountPage;
