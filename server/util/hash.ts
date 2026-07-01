import { createHash } from "node:crypto";

export function sha1(content: string): string {
  return "sha1:" + createHash("sha1").update(content, "utf8").digest("hex");
}
