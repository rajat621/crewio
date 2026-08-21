"""
janitor_temp_cleanup.py
Lightweight, config-driven temp artifact cleanup for OCR, raster, semantic, and debug artifacts.
- Age-based, bounded retention
- Isolated temp directories
- Skips active/retry-pending jobs
- Emits observability events
"""
import os
import time
import logging
from pathlib import Path
from config_runtime import CONFIG

logger = logging.getLogger("janitor_temp_cleanup")

# Configurable retention windows (seconds)
RETENTION = {
    "ocr": getattr(CONFIG.storage, "ocr_temp_retention_s", 3600),
    "raster": getattr(CONFIG.storage, "raster_temp_retention_s", 3600),
    "semantic": getattr(CONFIG.storage, "semantic_temp_retention_s", 3600),
    "debug": getattr(CONFIG.storage, "debug_retention_ms", 3600) // 1000,
}

# Isolated temp directories
TEMP_DIRS = {
    "ocr": Path(getattr(CONFIG.storage, "ocr_temp_dir", "./storage/tmp/ocr")),
    "raster": Path(getattr(CONFIG.storage, "raster_temp_dir", "./storage/tmp/raster")),
    "semantic": Path(getattr(CONFIG.storage, "semantic_temp_dir", "./storage/tmp/semantic")),
    "debug": Path(getattr(CONFIG.storage, "debug_dir", "./storage/debug")),
}

# Simulated active job check (replace with real check if available)
def is_active_artifact(path: Path) -> bool:
    # Placeholder: never delete files modified in last 10 min
    return (time.time() - path.stat().st_mtime) < 600

def cleanup_temp():
    deleted = 0
    skipped = 0
    failed = 0
    now = time.time()
    for key, temp_dir in TEMP_DIRS.items():
        if not temp_dir.exists():
            continue
        for f in temp_dir.glob("**/*"):
            if f.is_file():
                age = now - f.stat().st_mtime
                if is_active_artifact(f):
                    skipped += 1
                    logger.info(f"Skipped active artifact: {f}")
                    continue
                if age > RETENTION.get(key, 3600):
                    try:
                        os.remove(f)
                        deleted += 1
                        logger.info(f"Deleted temp artifact: {f}")
                    except Exception as e:
                        failed += 1
                        logger.warning(f"Failed to delete {f}: {e}")
    logger.info(f"Cleanup run: deleted={deleted}, skipped={skipped}, failed={failed}")
    # Emit observability event (replace with real system if available)
    print({"event": "temp_cleanup", "deleted": deleted, "skipped": skipped, "failed": failed, "ts": time.time()})

if __name__ == "__main__":
    cleanup_temp()
