# Free timing data

This project uses FastF1's public session archive and requires no paid account,
API key, or `.env` credentials. Bahrain is selected as the current event. When
FastF1 publishes Bahrain's timing archive, run the ingestion script to save the
available race laps locally.

Real-time telemetry during an active session is not available through the free
archive. OpenF1 live streaming requires its sponsor tier, and FastF1's live
timing access requires an F1 TV subscription. The dashboard reports archive-only
mode instead of prompting for paid credentials.

Install backend requirements and start the API from the repository root:

```powershell
pip install -r requirements.txt
uvicorn app.main:app --reload
```

After the Bahrain data is available in FastF1, `python -m app.ingest` stores the
race telemetry. Until then, the Bahrain API returns an explicit unavailable
message; it does not substitute Baku data.