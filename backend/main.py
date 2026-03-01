from app.main import app

if __name__ == "__main__":
    import uvicorn
    from app.core.config import settings
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.ENVIRONMENT == "development"
    )
