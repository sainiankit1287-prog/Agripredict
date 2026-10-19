# AgriPredict

## Create the Python virtual environment

From this folder:

```powershell
py -3 -m venv backend\.venv
backend\.venv\Scripts\python.exe -m pip install --upgrade pip
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

## Run locally

```powershell
backend\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --reload
cd frontend
npm install
npm run dev
```

## Run with Docker

```powershell
docker compose up --build
```

The API is available at `http://localhost:8000/health` and the frontend at `http://localhost:3000`.
# collage_aripredict
