import { createHmac, timingSafeEqual } from "node:crypto";

export function signAccess(code: string, secret: string): string {
  return createHmac("sha256", secret).update(code).digest("hex");
}
export function verifyAccess(cookieValue: string | undefined, secret: string): boolean {
  const code = process.env.ACCESS_CODE;
  if (!cookieValue || !code) return false;
  const expected = Buffer.from(signAccess(code, secret));
  const actual = Buffer.from(cookieValue);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
