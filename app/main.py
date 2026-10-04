import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

import duckdb
import fastf1
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import numpy as np

from app.ingest import (
    TELEMETRY_DIR,
    SESSION_CONFIG,
    _load_session,
    fetch_and_store_lap_telemetry,
)
from app.live import live_pipeline


@asynccontextmanager
async def lifespan(app: FastAPI):
    live_task = asyncio.create_task(live_pipeline.run())
    try:
        yield
    finally:
        live_pipeline.stop()
        live_task.cancel()
        try:
            await live_task
        except asyncio.CancelledError:
            pass


app = FastAPI(title="Pit Wall Analytics Hub", lifespan=lifespan)

# Allow Next.js (port 3000) to securely fetch from FastAPI (port 8000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ... keep your existing @app.get endpoints below ...

@app.get("/")
def read_root():
    return {"message": "Pit Wall Analytics API is active. Head to /docs for endpoints."}


@app.get("/live/status")
def get_live_status():
    return live_pipeline.status()


@app.get("/live/snapshot")
def get_live_snapshot():
    return live_pipeline.snapshot()


@app.websocket("/live/stream")
async def stream_live_snapshot(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            await websocket.send_json(live_pipeline.snapshot())
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        return

@app.get("/telemetry/{session_key}/{driver_number}/{lap_number}")
async def get_lap_telemetry(session_key: int, driver_number: int, lap_number: int):
    race_path = TELEMETRY_DIR / f"session_{session_key}_driver_{driver_number}.parquet"
    legacy_path = TELEMETRY_DIR / (
        f"session_{session_key}_driver_{driver_number}_lap_{lap_number}.parquet"
    )
    parquet_path = race_path if race_path.exists() else legacy_path
    if not parquet_path.exists():
        saved_path = await fetch_and_store_lap_telemetry(
            session_key, driver_number, lap_number
        )
        if not saved_path:
            raise HTTPException(status_code=404, detail="Lap telemetry unavailable.")
        parquet_path = saved_path

    con = duckdb.connect()
    lap_filter = f"WHERE lap_number = {lap_number}" if parquet_path == race_path else ""
    df = con.execute(
        f"SELECT * FROM '{parquet_path.as_posix()}' {lap_filter} ORDER BY date ASC"
    ).df()
    if df.empty:
        return {
            "session_key": session_key,
            "driver_number": driver_number,
            "lap_number": lap_number,
            "total_samples": 0,
            "samples": [],
        }
    
    if "date" in df.columns:
        df["timestamp"] = df["date"].dt.strftime('%H:%M:%S.%f')
    if "n_gear" in df.columns:
        df = df.rename(columns={"n_gear": "gear"})

    expected_cols = ["timestamp", "speed", "throttle", "brake", "gear", "drs", "x", "y"]
    cols_to_return = [c for c in expected_cols if c in df.columns]
    
    records = df[cols_to_return].to_dict(orient="records")

    return {
        "session_key": session_key,
        "driver_number": driver_number,
        "lap_number": lap_number,
        "total_samples": len(records),
        "samples": records,
    }


@app.get("/laps/{session_key}")
async def get_session_laps(session_key: int):
    try:
        session = await asyncio.to_thread(_load_session, session_key)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    try:
        lap_numbers = sorted(
            int(lap_number)
            for lap_number in session.laps["LapNumber"].dropna().unique()
        )
    except fastf1.exceptions.DataNotLoadedError as error:
        raise HTTPException(
            status_code=503,
            detail="Bahrain race timing is not available from the archive yet.",
        ) from error
    if not lap_numbers:
        raise HTTPException(
            status_code=503,
            detail="Bahrain race timing has not been published yet.",
        )
    return lap_numbers
    
@app.get("/delta/{session_key}/{driver1}/{driver2}/{lap_number}")
async def get_lap_delta(session_key: int, driver1: int, driver2: int, lap_number: int):
    async def load_driver_lap(driver_number: int):
        response = await get_lap_telemetry(session_key, driver_number, lap_number)
        race_path = TELEMETRY_DIR / f"session_{session_key}_driver_{driver_number}.parquet"
        legacy_path = TELEMETRY_DIR / (
            f"session_{session_key}_driver_{driver_number}_lap_{lap_number}.parquet"
        )
        parquet_path = race_path if race_path.exists() else legacy_path
        con = duckdb.connect()
        lap_filter = f"WHERE lap_number = {lap_number}" if parquet_path == race_path else ""
        return con.execute(
            f"SELECT * FROM '{parquet_path.as_posix()}' {lap_filter} ORDER BY date ASC"
        ).df()

    df1, df2 = await asyncio.gather(
        load_driver_lap(driver1), load_driver_lap(driver2)
    )

    if df1.empty or df2.empty:
        raise HTTPException(status_code=404, detail="Empty telemetry data.")

    # Calculate elapsed time from the start of the lap in seconds
    df1["elapsed"] = (df1["date"] - df1["date"].iloc[0]).dt.total_seconds()
    df2["elapsed"] = (df2["date"] - df2["date"].iloc[0]).dt.total_seconds()

    # Calculate cumulative distance: distance = speed (m/s) * elapsed time interval (s)
    dt1 = df1["elapsed"].diff().fillna(0)
    df1["distance"] = ((df1["speed"] / 3.6) * dt1).cumsum()

    dt2 = df2["elapsed"].diff().fillna(0)
    df2["distance"] = ((df2["speed"] / 3.6) * dt2).cumsum()

    # Create a uniform distance grid to align both cars perfectly
    max_dist = min(df1["distance"].max(), df2["distance"].max())
    grid = np.linspace(0, max_dist, num=400) # 400 sync points around the track

    # Interpolate time and calculate the delta!
    t1_interp = np.interp(grid, df1["distance"], df1["elapsed"])
    t2_interp = np.interp(grid, df2["distance"], df2["elapsed"])
    
    # Delta > 0 means Driver 1 reached that distance faster (Driver 1 is ahead)
    delta = t2_interp - t1_interp

    # Interpolate speed and track position so we can compare telemetry side-by-side
    speed1 = np.interp(grid, df1["distance"], df1["speed"])
    speed2 = np.interp(grid, df2["distance"], df2["speed"])
    throttle1 = np.interp(grid, df1["distance"], df1["throttle"])
    throttle2 = np.interp(grid, df2["distance"], df2["throttle"])
    x1 = np.interp(grid, df1["distance"], df1["x"])
    y1 = np.interp(grid, df1["distance"], df1["y"])

    samples = []
    for i in range(len(grid)):
        samples.append({
            "distance_m": round(grid[i], 1),
            "time_delta_s": round(delta[i], 3),
            "driver1_speed": round(speed1[i], 1),
            "driver2_speed": round(speed2[i], 1),
            "driver1_throttle": round(throttle1[i], 1),
            "driver2_throttle": round(throttle2[i], 1),
            "x": round(x1[i], 1),
            "y": round(y1[i], 1)
        })

    return {
        "session_key": session_key,
        "lap_number": lap_number,
        "reference_driver": driver1,
        "comparison_driver": driver2,
        "total_distance_m": round(max_dist, 1),
        "lap_time_delta": round(delta[-1], 3),
        "samples": samples
    }    
    
@app.get("/drivers/{session_key}")
async def get_session_drivers(session_key: int):
    try:
        session = await asyncio.to_thread(_load_session, session_key)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error

    if not session.drivers:
        raise HTTPException(
            status_code=503,
            detail="Bahrain driver timing is not available from the archive yet.",
        )

    grid = []
    for drv in session.drivers:
        info = session.get_driver(drv)
        color = info.get('TeamColor', 'FFFFFF')
        if not color or str(color).lower() == 'nan':
            color = 'FFFFFF'
            
        grid.append({
            "num": int(info['DriverNumber']),
            "name": info['Abbreviation'],
            "color": f"#{color}"
        })
        
    return grid    