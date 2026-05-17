// Allow up to 60s so a cold-starting ML backend (HF Space waking from
// sleep) has time to respond before we fall back to the heuristic stub.
export const maxDuration = 60;
export { POST } from "./AnalyzeShopApi";
