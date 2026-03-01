from fastapi import APIRouter
from app.api.v1.routes import products, stores, analytics, chatbot, reports, report_presets, google_sheets

api_router = APIRouter()

api_router.include_router(products.router, prefix="/products", tags=["products"])
api_router.include_router(stores.router, prefix="/stores", tags=["stores"])
api_router.include_router(analytics.router, prefix="/analytics", tags=["analytics"])
api_router.include_router(chatbot.router, prefix="/chatbot", tags=["chatbot"])
api_router.include_router(google_sheets.router, prefix="/sheets", tags=["google-sheets"])

