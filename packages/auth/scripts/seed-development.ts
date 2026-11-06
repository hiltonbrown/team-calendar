import { runDevelopmentSeed } from "@repo/database/seed/development-seed-runner";
import { seedDevelopmentAuthAccounts } from "../development-seed";

await runDevelopmentSeed((owner, password) =>
  seedDevelopmentAuthAccounts(owner, { password })
);
