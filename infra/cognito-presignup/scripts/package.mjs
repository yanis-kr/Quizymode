import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";

// Builds dist/presignup.zip containing index.mjs and lib/ (the Lambda runtime provides the AWS SDK).
rmSync("dist", { recursive: true, force: true });
mkdirSync("dist");
if (process.platform === "win32") {
  execFileSync(
    "powershell",
    ["-NoProfile", "-Command", "Compress-Archive -Path index.mjs,lib -DestinationPath dist/presignup.zip"],
    { stdio: "inherit" },
  );
} else {
  execFileSync("zip", ["-r", "dist/presignup.zip", "index.mjs", "lib"], { stdio: "inherit" });
}
console.log("Created dist/presignup.zip");
