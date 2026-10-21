"""Train and save the crop recommendation model."""

from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier

ROOT = Path(__file__).resolve().parent
DATASET = ROOT / "data" / "Crop_recommendation.csv"
ARTIFACT = ROOT / "artifacts" / "crop_recommendation_model.pkl"

if __name__ == "__main__":
    dataset = pd.read_csv(DATASET)
    features = [column for column in dataset.columns if column != "label"]
    model = RandomForestClassifier(n_estimators=100, random_state=42)
    model.fit(dataset[features], dataset["label"])
    ARTIFACT.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({"model": model, "features": features}, ARTIFACT)
    print(f"Saved model to {ARTIFACT}")
