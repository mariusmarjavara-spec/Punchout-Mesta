/**
 * po-crash-telemetry-aggregation: permanent regression coverage for
 * lib/operations-center/metrics.mjs::crashSummary() and
 * lib/backend/crash-pager.mjs::notifyCrashWebhook() — motor.js's
 * window.onerror/unhandledrejection capture existed and was tested
 * (see motor-cases.mjs's crash_reporting_* case) but nothing read or
 * paged on what it captured. This is that read/page side.
 */
import http from "node:http";
import { crashSummary } from "../operations-center/metrics.mjs";
import { notifyCrashWebhook } from "../backend/crash-pager.mjs";

function fakeClientError({ message, organizationId = "mesta", occurredAt = new Date().toISOString(), source = null, line = null, stack = null }) {
  return { id: "e_" + Math.random().toString(36).slice(2), type: "ClientError", occurredAt, organizationId, data: { message, source, line, stack } };
}

export const CRASH_TELEMETRY_CASES = [
  {
    id: "crash_summary_groups_by_message_with_real_counts",
    description: "The same recurring bug across many sessions must show as one signature with a real count, not N indistinguishable rows.",
    run: () => {
      const events = [
        fakeClientError({ message: "TypeError: x is undefined", occurredAt: "2026-08-14T10:00:00.000Z" }),
        fakeClientError({ message: "TypeError: x is undefined", occurredAt: "2026-08-14T11:00:00.000Z", organizationId: "nordhavn" }),
        fakeClientError({ message: "Unhandled promise rejection: network error", occurredAt: "2026-08-14T09:00:00.000Z" }),
        { type: "PromptAccepted", occurredAt: "2026-08-14T09:30:00.000Z", organizationId: "mesta", data: {} }, // must be ignored, not a crash
      ];
      const summary = crashSummary(events);
      if (summary.totalCount !== 3) return false;
      const top = summary.bySignature[0];
      return top.message === "TypeError: x is undefined" && top.count === 2
        && top.organizationIds.includes("mesta") && top.organizationIds.includes("nordhavn")
        && top.lastSeenAt === "2026-08-14T11:00:00.000Z";
    },
  },
  {
    id: "crash_summary_recent_is_sorted_newest_first_and_capped",
    description: "An admin triaging crashes needs the newest ones first, and a bounded list even under a real crash storm.",
    run: () => {
      const events = [
        fakeClientError({ message: "a", occurredAt: "2026-08-14T09:00:00.000Z" }),
        fakeClientError({ message: "b", occurredAt: "2026-08-14T11:00:00.000Z" }),
        fakeClientError({ message: "c", occurredAt: "2026-08-14T10:00:00.000Z" }),
      ];
      const summary = crashSummary(events, 2);
      return summary.recent.length === 2
        && summary.recent[0].message === "b"
        && summary.recent[1].message === "c";
    },
  },
  {
    id: "crash_summary_empty_when_no_crashes",
    description: "No ClientError events -> empty, honest summary, not a crash or a fabricated placeholder.",
    run: () => {
      const summary = crashSummary([{ type: "PromptAccepted", occurredAt: "2026-08-14T09:00:00.000Z", organizationId: "mesta", data: {} }]);
      return summary.totalCount === 0 && summary.bySignature.length === 0 && summary.recent.length === 0;
    },
  },
  {
    id: "crash_pager_noop_without_webhook_url_configured",
    description: "The pager must be genuinely opt-in — every existing deployment/test that never set PUNCHOUT_CRASH_WEBHOOK_URL must see zero behavior change (no network call attempted at all).",
    run: async () => {
      const original = process.env.PUNCHOUT_CRASH_WEBHOOK_URL;
      delete process.env.PUNCHOUT_CRASH_WEBHOOK_URL;
      const originalFetch = global.fetch;
      let called = false;
      global.fetch = async (...args) => { called = true; return originalFetch(...args); };
      try {
        notifyCrashWebhook(fakeClientError({ message: "should not page anyone" }));
        await new Promise((r) => setTimeout(r, 20));
        return called === false;
      } finally {
        global.fetch = originalFetch;
        if (original !== undefined) process.env.PUNCHOUT_CRASH_WEBHOOK_URL = original;
      }
    },
  },
  {
    id: "crash_pager_posts_real_payload_to_configured_webhook",
    description: "When configured, a real crash must actually reach the external webhook with the right fields — not just log locally.",
    run: async () => {
      let received = null;
      const server = http.createServer((req, res) => {
        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
          received = JSON.parse(body);
          res.writeHead(200);
          res.end("ok");
        });
      });
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const port = server.address().port;

      const original = process.env.PUNCHOUT_CRASH_WEBHOOK_URL;
      process.env.PUNCHOUT_CRASH_WEBHOOK_URL = `http://127.0.0.1:${port}/hook`;
      try {
        notifyCrashWebhook(fakeClientError({ message: "real crash reaches the pager", organizationId: "banenord", occurredAt: "2026-08-14T12:00:00.000Z" }));
        // notifyCrashWebhook is deliberately fire-and-forget (never awaited
        // by its caller) — poll briefly rather than assuming a fixed delay.
        for (let i = 0; i < 50 && received === null; i++) await new Promise((r) => setTimeout(r, 20));
        return received !== null
          && received.organizationId === "banenord"
          && received.message === "real crash reaches the pager"
          && received.text.includes("real crash reaches the pager")
          && received.text.includes("banenord");
      } finally {
        await new Promise((resolve) => server.close(resolve));
        if (original !== undefined) process.env.PUNCHOUT_CRASH_WEBHOOK_URL = original;
        else delete process.env.PUNCHOUT_CRASH_WEBHOOK_URL;
      }
    },
  },
  {
    id: "crash_pager_never_throws_when_webhook_endpoint_is_unreachable",
    description: "A dead/misconfigured pager URL must never break the telemetry ingest path itself — same fail-open posture as every other telemetry write in this codebase.",
    run: async () => {
      const original = process.env.PUNCHOUT_CRASH_WEBHOOK_URL;
      process.env.PUNCHOUT_CRASH_WEBHOOK_URL = "http://127.0.0.1:1/unreachable"; // port 1: nothing listens, connection refused immediately
      try {
        notifyCrashWebhook(fakeClientError({ message: "must not throw" }));
        return true; // reaching here at all means it didn't throw synchronously
      } catch {
        return false;
      } finally {
        if (original !== undefined) process.env.PUNCHOUT_CRASH_WEBHOOK_URL = original;
        else delete process.env.PUNCHOUT_CRASH_WEBHOOK_URL;
      }
    },
  },
];
