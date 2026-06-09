import { vi } from "vitest";

// The data layer reads the session cookie via next/headers. In unit tests
// there is no request context, so mock it to "no session" — getStore() then
// returns an empty store, which is exactly the edge case several tests assert.
vi.mock("next/headers", () => ({
  cookies: () => ({ get: () => undefined }),
}));
