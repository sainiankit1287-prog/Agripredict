"""Load and serve the crop recommendation model."""

import os
from pathlib import Path
from typing import Any

import joblib
import pandas as pd


FEATURES = ["N", "P", "K", "temperature", "humidity", "ph", "rainfall"]


def _model_path() -> Path:
    configured_path = os.getenv("MODEL_PATH")
    if configured_path:
        return Path(configured_path)
    return Path(__file__).resolve().parents[2] / "ml" / "artifacts" / "crop_recommendation_model.pkl"


class CropPredictor:
    def __init__(self) -> None:
        path = _model_path()
        if not path.is_file():
            raise FileNotFoundError(f"Crop recommendation model not found at {path}")
        saved = joblib.load(path)
        self.model: Any = saved["model"] if isinstance(saved, dict) else saved
        self.features = saved.get("features", FEATURES) if isinstance(saved, dict) else FEATURES

    def predict(self, values: dict[str, float]) -> str:
        frame = pd.DataFrame([[values[feature] for feature in self.features]], columns=self.features)
        return str(self.model.predict(frame)[0])

    def info(self) -> dict[str, object]:
        return {"features": self.features, "model": type(self.model).__name__}


_predictor: CropPredictor | None = None


def get_predictor() -> CropPredictor:
    global _predictor
    if _predictor is None:
        _predictor = CropPredictor()
    return _predictor
