export { GET, POST } from "./CronApi";

// Allow the worker plenty of time on a busy run — many campaigns + many
// recipients each + Resend HTTP. Vercel hobby/pro will cap at their own
// limits anyway.
export const maxDuration = 300;
