import asyncio
from functools import lru_cache
from pathlib import Path

import fastf1
import pandas as pd

TELEMETRY_DIR = Path(__file__).resolve().parent.parent / "data" / "telemetry"
SESSION_CONFIG = {
    9472: (2024, 1, "R", 1229),
    202616: (2026, 16, "R", 202616),
    202615: (2026, 15, "R", 202615),
}


@lru_cache(maxsize=None)
def _load_session(session_key: int):
    config = SESSION_CONFIG.get(session_key)
    if config is None:
        raise ValueError(f"Unsupported session key: {session_key}")

    session = fastf1.get_session(*config[:3])
    session.load(telemetry=True, weather=False, messages=False)
    return session


def _store_race_telemetry(session, session_key: int, driver_number: int):
    driver_laps = session.laps[
        (session.laps["DriverNumber"].astype(str) == str(driver_number))
        & session.laps["LapNumber"].notna()
    ].sort_values("LapNumber")
    lap_frames = []
    for _, lap in driver_laps.iterrows():
        telemetry = lap.get_telemetry()
        if telemetry.empty:
            continue

        telemetry = telemetry.rename(
            columns={
                "Date": "date",
                "Throttle": "throttle",
                "Brake": "brake",
                "RPM": "rpm",
                "Speed": "speed",
                "nGear": "n_gear",
                "DRS": "drs",
                "X": "x",
                "Y": "y",
            }
        )
        telemetry["session_key"] = session_key
        telemetry["meeting_key"] = SESSION_CONFIG[session_key][3]
        telemetry["driver_number"] = driver_number
        telemetry["lap_number"] = int(lap["LapNumber"])
        lap_frames.append(telemetry)

    if not lap_frames:
        return None

    race_telemetry = pd.concat(lap_frames, ignore_index=True)
    columns = [
        "date", "session_key", "lap_number", "throttle", "brake", "rpm",
        "speed", "meeting_key", "driver_number", "n_gear", "drs", "x", "y",
    ]
    race_telemetry = race_telemetry[columns]

    output_path = TELEMETRY_DIR / (
        f"session_{session_key}_driver_{driver_number}.parquet"
    )
    TELEMETRY_DIR.mkdir(parents=True, exist_ok=True)
    race_telemetry.to_parquet(output_path, index=False)
    return output_path


async def fetch_and_store_lap_telemetry(session_key: int, driver_number: int, lap_number: int):
    session = await asyncio.to_thread(_load_session, session_key)
    race_path = TELEMETRY_DIR / f"session_{session_key}_driver_{driver_number}.parquet"
    if not race_path.exists():
        race_path = await asyncio.to_thread(
            _store_race_telemetry, session, session_key, driver_number
        )
    if race_path is None:
        return None

    has_lap = await asyncio.to_thread(
        lambda: not session.laps[
            (session.laps["DriverNumber"].astype(str) == str(driver_number))
            & (session.laps["LapNumber"] == lap_number)
        ].empty
    )
    return race_path if has_lap else None

async def main():
    session_key = 202616

    print("Loading the 2026 Bahrain Grand Prix race...")
    session = await asyncio.to_thread(_load_session, session_key)
    drivers = session.drivers
    race_laps = sorted(session.laps["LapNumber"].dropna().astype(int).unique())

    print(
        f"Found {len(drivers)} drivers and {len(race_laps)} completed laps. "
        "Storing the full race...\n"
    )
    for driver_number in drivers:
        driver_number = int(driver_number)
        driver_name = session.get_driver(str(driver_number))["Abbreviation"]
        print(f"Downloading telemetry for {driver_name} ({driver_number})...")
        try:
            saved_path = await asyncio.to_thread(
                _store_race_telemetry, session, session_key, driver_number
            )
            if saved_path:
                print(f"Saved {driver_name}: {saved_path}")
            else:
                print(f"No race telemetry available for {driver_name}")
        except Exception as error:
            print(f"Failed to ingest {driver_name}: {error}")

    print("\nFull grid ingestion complete!")


if __name__ == "__main__":
    asyncio.run(main())