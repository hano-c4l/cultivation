/**
 * Default map channel. Each channel is a separate Durable Object and Cloudflare places it in a random
 * APAC data centre when first created (probed: ch3 = HKG, ch4 = SIN, others KIX/ICN), so pick a channel
 * whose colo is close to players. Re-probe per deployment (preview and production are separate namespaces).
 */
export const DEFAULT_CHANNEL = 4;
