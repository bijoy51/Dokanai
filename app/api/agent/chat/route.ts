export { POST } from "./ChatApi";

// Tool round-trips can take a while; give them headroom on Vercel.
export const maxDuration = 60;
