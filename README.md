# AgriPredict

AgriPredict is organized as a React/Vite frontend, a FastAPI backend, and a
Python machine-learning workspace. The trained crop recommendation model,
dataset, and analysis notebooks are imported under `ml/`.

## Local Python environment

From the project root in PowerShell:

```powershell
py -3.13 -m venv backend\.venv
.\backend\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r backend\requirements.txt
```

If PowerShell blocks activation, use the Python executable directly:

```powershell
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

Run the API:

```powershell
backend\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --reload
```

The API health endpoint is available at <http://localhost:8000/health>.
Create an account with `POST /auth/register` or sign in with
`POST /auth/login`. Both endpoints return a JWT in the `token` field. Send it
as an `Authorization: Bearer <token>` header when calling `POST /predict`,
`GET /auth/me`, or `GET /history`. Predictions are saved per user and the
history endpoint returns the latest 50 recommendations.

`POST /predict` accepts `N`, `P`, `K`, `temperature`, `humidity`, `ph`, and
`rainfall` values and returns a crop recommendation. For local development,
the API stores users and prediction history in `backend/data/agripredict.db`.
Set `JWT_SECRET` to a long random value outside development; `DATABASE_PATH`
can be used to choose another SQLite file.

## Frontend

```powershell
cd frontend
npm install
npm run dev
```

## Docker

Copy `.env.example` to `.env` and change credentials before sharing the
environment. Start the complete stack with:

```powershell
docker compose up --build
```

The frontend is at <http://localhost:3000>, the API is at
<http://localhost:8000>, PostgreSQL is on port `5432`, and Redis is on port
`6379`.

To retrain the imported model:

```powershell
backend\.venv\Scripts\python.exe ml\train.py
backend\.venv\Scripts\python.exe ml\evaluate.py
```

Stop the stack with:

```powershell
docker compose down
```
