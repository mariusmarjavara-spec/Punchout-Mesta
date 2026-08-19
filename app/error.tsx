"use client";

import { useEffect } from "react";
import { captureTelemetry } from "@/lib/telemetry";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Punchout feil:", error);
    captureTelemetry("app error", {
      boundary: "root",
      has_digest: Boolean(error.digest),
    });
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-8 bg-[#1b1b1b] text-[#fafafa]">
      <div className="flex flex-col items-center gap-6 text-center max-w-sm">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-900/50">
          <span className="text-2xl">!</span>
        </div>

        <div>
          <h1 className="text-xl font-bold">Noe gikk galt</h1>
          <p className="mt-2 text-sm text-[#9b9b9b]">
            Appen støtte på en feil. Dine data er lagret lokalt og skal være trygge.
          </p>
        </div>

        <button
          onClick={reset}
          type="button"
          className="rounded-xl bg-[#323232] px-6 py-4 font-medium transition-all active:scale-95"
        >
          Prøv igjen
        </button>

        <button
          onClick={() => window.location.reload()}
          type="button"
          className="text-sm text-[#9b9b9b] underline"
        >
          Last siden på nytt
        </button>
      </div>
    </div>
  );
}
