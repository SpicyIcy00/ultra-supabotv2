"""Legacy page gates: no real database, model calls, or business mutations."""
import importlib
import inspect
from types import SimpleNamespace

import pytest
from fastapi import APIRouter, Depends, FastAPI
from fastapi.testclient import TestClient

from app.core.database import get_db
from app.core.deps import get_current_user


# Whole routers have a single evidenced owner. Mixed routers are gated per endpoint.
OWNERS = {
    "chatbot": "ai_chat", "saved_queries": "ai_chat", "scheduled_reports": "ai_chat",
    "replenishment": "warehouse", "barcodes": "warehouse", "reports": "warehouse",
    "google_sheets": "warehouse",
}
ENDPOINTS = {
    "analytics": {
        "update_store_appearance": "settings", "invalidate_analytics_cache": "settings",
        **dict.fromkeys([
            "get_dashboard_kpis", "get_sales_by_category", "get_inventory_by_category",
            "get_sales_by_store", "get_top_products", "get_sales_trend", "get_top_categories",
        ], "dashboard"),
        **dict.fromkeys([
            "get_store_comparison_v2", "get_store_drilldown_v2", "get_category_performance_matrix",
            "get_store_weekly_trends", "get_top_movers", "get_day_of_week_patterns",
            "get_product_combos", "get_sales_anomalies",
        ], "analytics"),
    },
    "vending": dict.fromkeys([
        "get_dashboard_kpis", "get_sales_by_machine", "get_top_products", "get_sales_trend",
        "get_top_categories", "get_sales_by_hour", "get_stock_levels", "get_failed_vends",
    ], "dashboard"),
    "store_filters": dict.fromkeys([
        "get_store_filters", "update_store_filters", "get_available_stores", "initialize_default_filters",
    ], "settings"),
    "dashboard_defaults": {"update_dashboard_defaults": "settings"},
}


def protected_routes():
    for name in OWNERS.keys() | ENDPOINTS.keys():
        router = importlib.import_module(f"app.api.v1.routes.{name}").router
        for route in router.routes:
            page = OWNERS.get(name) or ENDPOINTS[name].get(route.endpoint.__name__)
            if page:
                yield pytest.param(route, page, id=f"{name}:{route.endpoint.__name__}")


@pytest.mark.parametrize("route,page", list(protected_routes()))
def test_bound_gate_rejects_anonymous_and_wrong_page_before_business_code(route, page):
    # Inspect the actual registered route, not a separately copied dependency.
    gates = [d.call for d in route.dependant.dependencies
             if inspect.isfunction(d.call) and
             inspect.getclosurevars(d.call).nonlocals.get("page_key") == page]
    assert len(gates) == 1
    app = FastAPI()
    subject = APIRouter()
    subject.routes.append(route)
    app.include_router(subject, prefix="/subject")

    class Session:
        async def execute(self, statement):
            return SimpleNamespace(scalar_one_or_none=lambda: False)

    app.dependency_overrides[get_db] = lambda: Session()
    path = "/subject" + route.path
    for parameter in route.param_convertors:
        path = path.replace("{" + parameter + "}", "test-id")
    method = sorted(route.methods)[0]
    with TestClient(app) as client:
        assert client.request(method, path).status_code == 401
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(role="warehouse_staff")
        assert client.request(method, path).status_code == 403

    # Exercise that exact gate with a permitted role, without executing business code.
    probe = FastAPI()
    enabled = True

    class PermissionSession:
        async def execute(self, statement):
            assert statement.compile().params["page_key_1"] == page
            return SimpleNamespace(scalar_one_or_none=lambda: enabled)

    probe.dependency_overrides[get_db] = lambda: PermissionSession()
    probe.dependency_overrides[get_current_user] = lambda: SimpleNamespace(role="admin")

    @probe.get("/probe", dependencies=[Depends(gates[0])])
    def allowed():
        return {"ok": True}

    with TestClient(probe) as client:
        assert client.get("/probe").status_code == 200
        enabled = False  # Revocation takes effect immediately, even for admin.
        assert client.get("/probe").status_code == 403


def test_ambiguous_routes_remain_unchanged():
    # Shared catalog/configuration reads and older, unmounted reporting clients
    # do not establish a unique existing page permission. Do not guess one.
    ambiguous = {
        "analytics": {"get_stores", "get_sales_by_hour", "get_store_performance",
                      "get_daily_trend", "get_kpi_metrics", "get_product_performance",
                      "get_store_comparison", "get_store_categories", "get_store_top_products"},
        "vending": {"get_devices"},
        "dashboard_defaults": {"get_dashboard_defaults"},
    }
    for name in ["stores", "products", "report_presets", *ambiguous]:
        router = importlib.import_module(f"app.api.v1.routes.{name}").router
        for route in router.routes:
            if name in ambiguous and route.endpoint.__name__ not in ambiguous[name]:
                continue
            assert not route.dependencies, f"Permission needs a decision: {name} {route.path}"
