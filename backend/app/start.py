"""One launch path for Railway, Procfile and Nixpacks.

Production retains migration-before-boot compatibility. Staging sets
AUTO_MIGRATE_ON_START=false and migrates explicitly before launching this app.
"""
import os
import subprocess
import sys

from app.core.config import settings


def main():
    if settings.AUTO_MIGRATE_ON_START:
        subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], check=True)
    else:
        print("Automatic migrations disabled: application will verify schema", flush=True)
    os.execv(sys.executable, [sys.executable, "-m", "uvicorn", "app.main:app",
                            "--host", "0.0.0.0", "--port", os.environ.get("PORT", "8000")])


if __name__ == "__main__":
    main()
