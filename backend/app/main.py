import sys
import asyncio
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.services.schema_context import SchemaContext

# Fix for Windows: Use WindowsSelectorEventLoopPolicy for async operations with psycopg
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_PREFIX}/openapi.json"
)

# CRITICAL: CORS must be added IMMEDIATELY after app creation and BEFORE routes
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://ultra-supabotv2.vercel.app",
        "https://ultra-supabotv2-i0daqfszt-spicyicy00s-projects.vercel.app",
        "https://*.vercel.app",
        "http://localhost:5173",
        "http://localhost:3000",
        "*"  # Fallback for development
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Startup event: Initialize SchemaContext
@app.on_event("startup")
async def startup_event():
    """Initialize services on application startup"""
    
    # Debug: Print database connection info (redacted)
    try:
        db_url = settings.DATABASE_URL
        if "@" in db_url:
            # simple redaction
            prefix = db_url.split("@")[0]
            suffix = db_url.split("@")[1]
            redacted_prefix = prefix.split(":")[0] + ":****"
            print(f"DEBUG: Connecting to database at: {redacted_prefix}@{suffix}")
        else:
            print(f"DEBUG: Connecting to database at: {db_url}")
    except Exception as e:
        print(f"DEBUG: Error logging DB info: {e}")

    # Initialize schema context with database connection
    business_rules_path = Path(__file__).parent.parent / "business_rules.yaml"
    SchemaContext.initialize(
        database_url=settings.DATABASE_URL,
        business_rules_path=str(business_rules_path)
    )
            
    print("SchemaContext initialized")
    print("REGISTERED ROUTES START")
    for route in app.routes:
        if hasattr(route, "path"):
            print(f"ROUTE: {route.path}")
    print("REGISTERED ROUTES END")


# Shutdown event: Clean up resources
@app.on_event("shutdown")
async def shutdown_event():
    """Clean up resources on application shutdown"""
    SchemaContext.shutdown()
    print("SchemaContext shut down")

from app.api.v1.routes import analytics, chatbot, stores, products, reports, report_presets

app.include_router(analytics.router, prefix=f"{settings.API_V1_PREFIX}/analytics")
app.include_router(chatbot.router, prefix=f"{settings.API_V1_PREFIX}/chatbot")
app.include_router(reports.router, prefix=f"{settings.API_V1_PREFIX}/reports", tags=["reports"])
app.include_router(report_presets.router, prefix=f"{settings.API_V1_PREFIX}/report-presets")
app.include_router(stores.router, prefix=f"{settings.API_V1_PREFIX}/stores", tags=["stores"])
app.include_router(products.router, prefix=f"{settings.API_V1_PREFIX}/products", tags=["products"])


@app.get("/")
def root():
    return {"message": "BI Dashboard API", "version": settings.VERSION}

@app.get("/health")
def health_check():
    return {"status": "healthy"}



# Version: 1.0.0

if __name__ == "__main__":
    import uvicorn
    import os
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=False)