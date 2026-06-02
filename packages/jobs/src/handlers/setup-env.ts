import fs from "node:fs";
import path from "node:path";

try {
  const targetPath = path.join(import.meta.dirname, "../../../database/.env");
  const envPath = path.normalize(targetPath);
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=");
        const value = valueParts.join("=");
        if (key && value) {
          const cleanKey = key.trim();
          if (
            cleanKey !== "__proto__" &&
            cleanKey !== "constructor" &&
            cleanKey !== "prototype"
          ) {
            Reflect.set(
              process.env,
              cleanKey,
              value.trim().replace(/^['"]|['"]$/g, "")
            );
          }
        }
      }
    }
  }
} catch {
  // ignore
}
