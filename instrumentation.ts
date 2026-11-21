// Registers the Telegram webhook by itself the first time a production server starts, so there is no setup command.
// Never throws and never waits long: a failure is only logged (scripts/telegram_setup.py --status shows the webhook).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.VERCEL_ENV !== "production") return;
  const token = process.env.TELEGRAM_BOT_TOKEN, secret = process.env.TELEGRAM_SECRET;
  const host = process.env.APP_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  if (!token || !secret || !host?.startsWith("https://")) return;
  const want = `${host.replace(/\/$/, "")}/api/telegram`;
  const api = (m: string, body?: object) =>
    fetch(`https://api.telegram.org/bot${token}/${m}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}), signal: AbortSignal.timeout(3000),
    }).then((r) => r.json());
  try {
    const info = await api("getWebhookInfo");
    if (info?.result?.url !== want) {
      const r = await api("setWebhook", { url: want, secret_token: secret, allowed_updates: ["message", "callback_query"] });
      console.log("telegram webhook set:", want, r?.ok);
    }
  } catch (e) {
    console.error("telegram webhook setup failed:", e);
  }
}
