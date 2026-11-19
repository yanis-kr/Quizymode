// SSM target. A value reaches `aws` only through a private temp file (file://), never as an argument.
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function makeSsmTarget({ aws, prefix, tmpRoot = tmpdir() }) {
  const nameOf = (param) => `${prefix}/${param}`;
  return {
    nameOf,
    put(param, value) {
      const dir = mkdtempSync(join(tmpRoot, "qm-rotate-"));
      const file = join(dir, "v");
      try {
        writeFileSync(file, value, { mode: 0o600 });
        try { chmodSync(file, 0o600); } catch { /* best effort on Windows */ }
        const r = aws(["ssm", "put-parameter", "--name", nameOf(param), "--type", "SecureString", "--overwrite", "--value", `file://${file.replaceAll("\\", "/")}`, "--query", "Version", "--output", "text"]);
        if (r.status !== 0) throw new Error(`put-parameter failed for ${nameOf(param)}`);
        return Number(String(r.stdout).trim());
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    /** Reads a value into memory only (the caller must not log it). */
    get(param) {
      const r = aws(["ssm", "get-parameter", "--name", nameOf(param), "--with-decryption", "--query", "Parameter.Value", "--output", "text"]);
      if (r.status !== 0) throw new Error(`get-parameter failed for ${nameOf(param)}`);
      return String(r.stdout).replace(/\r?\n$/, "");
    },
  };
}
