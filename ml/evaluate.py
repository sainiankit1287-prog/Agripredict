"""Evaluate the saved crop recommendation model."""

from pathlib import Path

import joblib
import pandas as pd
from sklearn.metrics import accuracy_score

ROOT = Path(__file__).resolve().parent
DATASET = ROOT / "data" / "Crop_recommendation.csv"
ARTIFACT = ROOT / "artifacts" / "crop_recommendation_model.pkl"

if __name__ == "__main__":
    dataset = pd.read_csv(DATASET)
    saved = joblib.load(ARTIFACT)
    features = saved["features"]
    predictions = saved["model"].predict(dataset[features])
    print(f"Accuracy: {accuracy_score(dataset['label'], predictions):.4f}")
