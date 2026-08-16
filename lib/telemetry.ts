const TELEMETRY_ID_KEY = "punchout:telemetry-id";

type TelemetryProperties = Record<string, string | number | boolean | null>;

function getConfig() {
  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

  if (!token || !host) return null;

  return {
    token,
    host: host.replace(/\/$/, ""),
  };
}

function getAnonymousId(): string {
  if (typeof window === "undefined") return "server";

  try {
    const existing = window.localStorage.getItem(TELEMETRY_ID_KEY);
    if (existing) return existing;

    const created = crypto.randomUUID();
    window.localStorage.setItem(TELEMETRY_ID_KEY, created);
    return created;
  } catch {
    // Storage can be unavailable in restricted/private browser contexts.
    // A per-page UUID still lets the event be captured without blocking Punchout.
    return crypto.randomUUID();
  }
}

export function captureTelemetry(
  event: string,
  properties: TelemetryProperties = {},
): void {
  if (typeof window === "undefined") return;

  const config = getConfig();
  if (!config) return;

  const payload = {
    api_key: config.token,
    distinct_id: getAnonymousId(),
    event,
    properties: {
      ...properties,
      $process_person_profile: false,
      product: "punchout",
    },
  };

  void fetch(`${config.host}/i/v0/e/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    // Telemetry must never interfere with the local-first application flow.
  });
}
