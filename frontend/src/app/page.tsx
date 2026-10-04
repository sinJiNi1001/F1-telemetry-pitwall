"use client";

import { useEffect, useState } from "react";
import TrackMap from "./components/TrackMap";
import TelemetryChart from "./components/TelemetryChart";

const API_BASE = "http://127.0.0.1:8000";
const SESSION_KEY = 202615;

type Driver = { num: number; name: string; color: string };

export default function Home() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [laps, setLaps] = useState<number[]>([]);
  const [selectedLap, setSelectedLap] = useState(1);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch(`${API_BASE}/drivers/${SESSION_KEY}`, { signal: controller.signal }),
      fetch(`${API_BASE}/laps/${SESSION_KEY}`, { signal: controller.signal }),
    ])
      .then(async ([driverResponse, lapResponse]) => {
        if (!driverResponse.ok || !lapResponse.ok) {
          throw new Error("Could not load the Azerbaijan race session.");
        }
        const [driverData, lapData] = await Promise.all([
          driverResponse.json(),
          lapResponse.json(),
        ]);
        setDrivers(driverData);
        setLaps(lapData);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name !== "AbortError") {
          setLoadError(error.message);
        }
      });

    return () => controller.abort();
  }, []);

  return (
    <main className="min-h-dvh bg-[#101516] px-4 py-4 text-[#edf1eb] sm:px-6 sm:py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#ef5948]">
            2026 · Azerbaijan Grand Prix
          </p>
          <h1 className="text-2xl font-bold leading-tight sm:text-3xl">Pit Wall Hub</h1>
        </div>
        <label className="flex items-center gap-3 text-sm text-[#a8b1ac]">
          <span>Race lap</span>
          <select
            aria-label="Select race lap"
            className="min-w-24 rounded border border-white/15 bg-[#1a2222] px-3 py-2 text-sm font-semibold text-white outline-none focus:border-[#ef5948]"
            value={selectedLap}
            onChange={(event) => setSelectedLap(Number(event.target.value))}
            disabled={laps.length === 0}
          >
            {laps.length === 0 && <option value={1}>Loading</option>}
            {laps.map((lap) => <option key={lap} value={lap}>{lap}</option>)}
          </select>
        </label>
      </header>

      {loadError ? (
        <div className="border-l-2 border-[#ef5948] bg-[#1a2222] px-4 py-3 text-sm text-[#f0b7af]">
          {loadError} Check that the API is running.
        </div>
      ) : (
        <div className="grid min-h-[calc(100dvh-132px)] grid-cols-1 gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="flex min-h-[380px] flex-col rounded-md border border-white/10 bg-[#171f20] p-4 sm:p-5">
            <TrackMap drivers={drivers} sessionKey={SESSION_KEY} lapNumber={selectedLap} />
          </section>
          <section className="flex min-h-[380px] flex-col rounded-md border border-white/10 bg-[#171f20] p-4 sm:p-5">
            <TelemetryChart drivers={drivers} sessionKey={SESSION_KEY} lapNumber={selectedLap} />
          </section>
        </div>
      )}
    </main>
  );
}