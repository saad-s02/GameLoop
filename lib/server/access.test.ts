import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signAccess, verifyAccess } from "./access";

const ORIGINAL_ACCESS_CODE = process.env.ACCESS_CODE;
const ORIGINAL_ACCESS_COOKIE_SECRET = process.env.ACCESS_COOKIE_SECRET;

describe("access sign/verify", () => {
  beforeEach(() => {
    process.env.ACCESS_CODE = "letmein";
    process.env.ACCESS_COOKIE_SECRET = "test-secret";
  });

  afterEach(() => {
    if (ORIGINAL_ACCESS_CODE === undefined) delete process.env.ACCESS_CODE;
    else process.env.ACCESS_CODE = ORIGINAL_ACCESS_CODE;
    if (ORIGINAL_ACCESS_COOKIE_SECRET === undefined) delete process.env.ACCESS_COOKIE_SECRET;
    else process.env.ACCESS_COOKIE_SECRET = ORIGINAL_ACCESS_COOKIE_SECRET;
  });

  it("sign/verify round-trips true for the correct cookie", () => {
    const cookie = signAccess(process.env.ACCESS_CODE!, process.env.ACCESS_COOKIE_SECRET!);
    expect(verifyAccess(cookie, process.env.ACCESS_COOKIE_SECRET!)).toBe(true);
  });

  it("rejects a wrong cookie value", () => {
    const wrongCookie = signAccess("some-other-code", process.env.ACCESS_COOKIE_SECRET!);
    expect(verifyAccess(wrongCookie, process.env.ACCESS_COOKIE_SECRET!)).toBe(false);
  });

  it("rejects a cookie signed with a different secret", () => {
    const cookie = signAccess(process.env.ACCESS_CODE!, "a-different-secret");
    expect(verifyAccess(cookie, process.env.ACCESS_COOKIE_SECRET!)).toBe(false);
  });

  it("returns false when the cookie is missing", () => {
    expect(verifyAccess(undefined, process.env.ACCESS_COOKIE_SECRET!)).toBe(false);
  });

  it("returns false when ACCESS_CODE is not set", () => {
    const cookie = signAccess(process.env.ACCESS_CODE!, process.env.ACCESS_COOKIE_SECRET!);
    delete process.env.ACCESS_CODE;
    expect(verifyAccess(cookie, process.env.ACCESS_COOKIE_SECRET!)).toBe(false);
  });
});
