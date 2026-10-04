"use client";
import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Driver = { num: number; name: string; color: string };
type Sample = { timestamp: string; speed: number };

type TelemetryChartProps = {
  drivers: Driver[];
  sessionKey: number;
  lapNumber: number;
};

export default function TelemetryChart({ drivers, sessionKey, lapNumber }: TelemetryChartProps) {
  const [result, setResult] = useState<{
    requestKey: string;
    telemetry: (Sample[] | null)[];
  } | null>(null);
  const requestKey = `${sessionKey}:${lapNumber}`;

  useEffect(() => {
    if (drivers.length === 0) return;
    const controller = new AbortController();
    Promise.all(
      drivers.map(async (driver) => {
        const response = await fetch(
          `http://127.0.0.1:8000/telemetry/${sessionKey}/${driver.num}/${lapNumber}`,
          { signal: controller.signal },
        );
        if (!response.ok) return null;
        const responseData = await response.json();
        return responseData.samples as Sample[];
      }),
    )
      .then((telemetry) => setResult({ requestKey, telemetry }))
      .catch((error: unknown) => {
        if (error instanceof Error && error.name !== "AbortError") {
          console.error("Grid telemetry error:", error);
        }
      });

    return () => controller.abort();
  }, [drivers, lapNumber, requestKey, sessionKey]);

  const telemetry = result?.requestKey === requestKey ? result.telemetry : null;
  const loading = result?.requestKey !== requestKey;
  const data = Array.from({ length: 101 }, (_, progressIndex) => {
    const progress = progressIndex / 100;
    const row: Record<string, number | string> = {
      progress: progressIndex,
    };

    telemetry?.forEach((samples, driverIndex) => {
      if (!samples?.length) return;
      const samplePosition = progress * (samples.length - 1);
      const lowerIndex = Math.floor(samplePosition);
      const upperIndex = Math.min(lowerIndex + 1, samples.length - 1);
      const fraction = samplePosition - lowerIndex;
      const lowerSpeed = samples[lowerIndex].speed;
      const upperSpeed = samples[upperIndex].speed;
      row[`speed_${drivers[driverIndex].num}`] =
        lowerSpeed + (upperSpeed - lowerSpeed) * fraction;
    });

    return row;
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Speed comparison</h2>
          <p className="mt-1 text-xs text-[#a8b1ac]">Lap {lapNumber} · full grid</p>
        </div>
        <span className="text-xs tabular-nums text-[#a8b1ac]">
          {telemetry?.filter((samples) => samples && samples.length > 0).length ?? drivers.length} running
        </span>
      </div>

      <div className="min-h-0 flex-1">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-[#a8b1ac]">Loading lap data...</div>
        ) : telemetry?.every((samples) => !samples?.length) ? (
          <div className="flex h-full items-center justify-center text-sm text-[#a8b1ac]">No telemetry for this lap.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 12, right: 10, bottom: 4, left: -18 }}>
              <CartesianGrid stroke="#ffffff12" vertical={false} />
              <XAxis
                dataKey="progress"
                stroke="#87918b"
                tick={{ fill: "#87918b", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `${value}%`}
                ticks={[0, 25, 50, 75, 100]}
              />
              <YAxis
                stroke="#87918b"
                tick={{ fill: "#87918b", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={42}
                tickFormatter={(value) => `${Math.round(Number(value))}`}
                domain={["dataMin - 15", "dataMax + 15"]}
              />
              <Tooltip
                contentStyle={{ backgroundColor: "#1a2222", border: "1px solid #ffffff20", borderRadius: 4 }}
                labelStyle={{ color: "#a8b1ac" }}
                formatter={(value, name) => [`${Number(value).toFixed(0)} km/h`, name]}
                labelFormatter={(value) => `${value}% lap progress`}
              />
              {drivers.map((driver) => (
                <Line
                  key={driver.num}
                  type="monotone"
                  dataKey={`speed_${driver.num}`}
                  name={driver.name}
                  stroke={driver.color}
                  strokeOpacity={0.82}
                  dot={false}
                  strokeWidth={1.5}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-x-2 gap-y-1.5 border-t border-white/10 pt-3 sm:grid-cols-5 xl:grid-cols-4">
        {drivers.map((driver) => (
          <div key={driver.num} className="flex min-w-0 items-center gap-1.5 text-[10px] text-[#cbd1cc]">
            <span className="h-1.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: driver.color }} />
            <span className="truncate">{driver.name}</span>
            <span className="ml-auto tabular-nums text-[#87918b]">{driver.num}</span>
          </div>
        ))}
      </div>
    </div>
  );
}