"""Image processing utilities for photo upload"""
import os
import uuid
from typing import Optional
from fastapi import UploadFile
from PIL import Image
import io

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
MAX_WIDTH = 1920
JPEG_QUALITY = 85

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", "worklog-photos")


def _ensure_upload_dir():
    os.makedirs(UPLOAD_DIR, exist_ok=True)


def validate_image(file: UploadFile) -> Optional[str]:
    if not file.filename:
        return "No filename"
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        return f"File type {ext} not allowed. Use: {', '.join(ALLOWED_EXTENSIONS)}"
    return None


async def process_image(file: UploadFile) -> tuple[str, Optional[str]]:
    _ensure_upload_dir()

    validation_error = validate_image(file)
    if validation_error:
        return "", validation_error

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        return "", f"File too large ({len(content) / 1024 / 1024:.1f}MB). Max 5MB."

    try:
        img = Image.open(io.BytesIO(content))

        if img.mode in ("RGBA", "P", "LA"):
            img = img.convert("RGB")

        width, height = img.size
        if width > MAX_WIDTH:
            ratio = MAX_WIDTH / width
            new_height = int(height * ratio)
            img = img.resize((MAX_WIDTH, new_height), Image.LANCZOS)

        unique_name = f"{uuid.uuid4().hex[:12]}_{os.path.splitext(file.filename)[0]}.jpg"
        file_path = os.path.join(UPLOAD_DIR, unique_name)

        img.save(file_path, "JPEG", quality=JPEG_QUALITY, optimize=True)

        return f"uploads/worklog-photos/{unique_name}", None
    except Exception as e:
        return "", f"Failed to process image: {str(e)}"


def delete_image_file(file_path: str) -> bool:
    if not file_path:
        return False
    full_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), file_path)
    if os.path.exists(full_path):
        try:
            os.remove(full_path)
            return True
        except OSError:
            return False
    return False
