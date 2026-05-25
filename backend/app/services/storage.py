import json
import os

PROJECT_DIR = "backend/projects"


def save_project(project_id: str, data: dict):
    os.makedirs(PROJECT_DIR, exist_ok=True)

    path = os.path.join(PROJECT_DIR, f"{project_id}.json")

    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def load_project(project_id: str):
    path = os.path.join(PROJECT_DIR, f"{project_id}.json")

    if not os.path.exists(path):
        return None

    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)