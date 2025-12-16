import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
import os
from dotenv import load_dotenv

# Load env vars
load_dotenv()

# Get DB URL from env or use the one provided earlier if missing
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("DATABASE_URL not found in environment, using default...")
    # Fallback to the one user provided if .env isn't loaded correctly
    DATABASE_URL = "postgresql+psycopg://postgres:TBNRfrags10!@db.dthuakuwtqdsspyatprp.supabase.co:5432/postgres"

# Build async engine
# Note: The project uses postgresql+asyncpg usually, but the user provided postgresql+psycopg
# We will try to use the one in the URL. If it fails due to driver, we might need to swap scheme.
# The user's provided URL was: postgresql+psycopg://...
# But checking the project, it uses asyncpg usually.
# Let's trust the DATABASE_URL string but ensure we have the driver.
# If the URL is postgresql+psycopg://, we need psycopg installed (which it is).
# However, create_async_engine works best with asyncpg or psycopg (async mode).

# Fix for Windows event loop
import sys
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

async def fetch_stores():
    print(f"Connecting to: {DATABASE_URL.split('@')[-1]}") # Hide credentials
    
    try:
        engine = create_async_engine(DATABASE_URL, echo=False)
        
        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT id, name, city FROM stores ORDER BY name;"))
            rows = result.fetchall()
            
            print("\n--- STORES FROM DIRECT DB QUERY ---")
            print(f"{'ID':<30} | {'NAME':<30} | {'CITY':<15}")
            print("-" * 80)
            for row in rows:
                print(f"{str(row.id):<30} | {row.name:<30} | {row.city or 'N/A':<15}")
            print("-" * 80)
            print(f"Total: {len(rows)} stores found.\n")
            
        await engine.dispose()
        
    except Exception as e:
        print(f"Error querying database: {e}")

if __name__ == "__main__":
    asyncio.run(fetch_stores())
