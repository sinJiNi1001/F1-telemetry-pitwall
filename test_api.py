import asyncio
import httpx
from datetime import timedelta
import pandas as pd

OPENF1_BASE = "https://api.openf1.org/v1"

def format_f1_date(dt: pd.Timestamp) -> str:
    return dt.strftime('%Y-%m-%dT%H:%M:%S.%f')

async def run_test():
    session_key = 9472
    driver_number = 1
    lap_number = 10

    print(f"--- TESTING SESSION {session_key}, DRIVER {driver_number}, LAP {lap_number} ---")
    
    async with httpx.AsyncClient(base_url=OPENF1_BASE) as client:
        # 1. Fetch Lap
        laps_req = client.build_request("GET", "/laps", params={
            "session_key": session_key,
            "driver_number": driver_number,
            "lap_number": lap_number
        })
        print(f"\n1. Requesting Laps: {laps_req.url}")
        lap_res = await client.send(laps_req)
        
        lap_data = lap_res.json()
        print(f"Lap Response ({lap_res.status_code}): {lap_data}")
        
        if not lap_data:
            print("FAILED: No lap data returned.")
            return

        lap_record = lap_data[0]
        start_time = pd.to_datetime(lap_record["date_start"])
        lap_duration_seconds = lap_record.get("lap_duration")
        
        end_time = start_time + timedelta(seconds=lap_duration_seconds)
        start_time_str = format_f1_date(start_time)
        end_time_str = format_f1_date(end_time)
        
        print(f"\nCalculated Window: {start_time_str} TO {end_time_str}")

        # 2. Fetch Car Data
        car_req = client.build_request("GET", "/car_data", params={
            "session_key": session_key,
            "driver_number": driver_number,
            "date>=": start_time_str,
            "date<=": end_time_str
        })
        print(f"\n2. Requesting Car Data: {car_req.url}")
        car_res = await client.send(car_req)
        
        car_data = car_res.json()
        if isinstance(car_data, list):
             print(f"Car Data Success: {len(car_data)} rows found!")
        else:
             print(f"Car Data Failed/Empty: {car_data}")

asyncio.run(run_test())