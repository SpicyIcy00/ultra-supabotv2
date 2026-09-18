"""
The metric model: every trusted figure declares what it is, and a derived
metric's formula and its executable SQL cannot drift apart.

NO DATABASE. Definitions and source only.

WHY THIS EXISTS. Until 2026-09-07 a metric was a SQL fragment with a unit, and
what it was — base or derived, which business, made of what — lived in prose.
average_transaction_value is the first metric COMPOSED of others, and the
model may not compose anything: the SQL in metrics.yaml is the executable
definition, the `formula` beside it is the declaration, and this file is what
holds the two together. A formula that said net_sales / transaction_count over
a SQL that quietly divided by COUNT(*) would answer a different question with
the right label, which is the failure the whole definitions file exists to
prevent.

Every rule the model header in metrics.yaml states is asserted here:
dependencies exist, in the same domain; grains agree; valid_group_by is no
broader than the dependencies' intersection; the SQL is literally the
dependencies' SQL in the declared template.
"""

from __future__ import annotations

import pytest

pytest.importorskip("yaml", reason="metrics.yaml has to be read")

from tools._common import load_defs, req  # noqa: E402

DEFS = load_defs()
MODEL = req(DEFS, "metric_model")


def _registry(path: str) -> dict:
    return req(DEFS, path)


def _registries() -> dict[str, dict]:
    return {path: _registry(path) for path in req(DEFS, "metric_model.registries")}


# ---------------------------------------------------------------------------
# Every metric, every domain
# ---------------------------------------------------------------------------

def test_every_registry_named_in_the_model_exists():
    for path, spec in req(DEFS, "metric_model.registries").items():
        assert isinstance(_registry(path), dict) and _registry(path), path
        assert spec["domain"], f"{path} has no domain"


@pytest.mark.parametrize("path", sorted(req(DEFS, "metric_model.registries")))
def test_every_metric_declares_the_required_fields(path):
    required = req(DEFS, "metric_model.required_fields")
    for name, mdef in _registry(path).items():
        missing = [f for f in required if f not in mdef]
        assert not missing, f"{path}.{name} is missing {missing}"


@pytest.mark.parametrize("path", sorted(req(DEFS, "metric_model.registries")))
def test_every_metric_belongs_to_its_registrys_domain(path):
    """A metric applies to exactly one business, and it is the registry's."""
    domain = req(DEFS, "metric_model.registries")[path]["domain"]
    for name, mdef in _registry(path).items():
        assert mdef["domain"] == domain, (
            f"{path}.{name} says domain {mdef['domain']!r}; its registry is {domain!r}"
        )


@pytest.mark.parametrize("path", sorted(req(DEFS, "metric_model.registries")))
def test_every_kind_is_one_the_model_defines(path):
    kinds = set(req(DEFS, "metric_model.kinds"))
    for name, mdef in _registry(path).items():
        assert mdef["kind"] in kinds, f"{path}.{name}: kind {mdef['kind']!r}"


def test_display_names_are_words_not_keys():
    """The label a person sees must not be the yaml key with the case changed."""
    for path, reg in _registries().items():
        for name, mdef in reg.items():
            label = mdef["display_name"]
            assert isinstance(label, str) and label.strip(), f"{path}.{name}"
            assert "_" not in label, f"{path}.{name}: {label!r} reads as a key"


# ---------------------------------------------------------------------------
# Derived metrics
# ---------------------------------------------------------------------------

def _derived() -> list[tuple[str, str, dict, dict]]:
    out = []
    for path, reg in _registries().items():
        for name, mdef in reg.items():
            if mdef["kind"] == "derived":
                out.append((path, name, mdef, reg))
    return out


DERIVED = _derived()


def test_there_is_exactly_one_derived_metric_in_v1():
    """
    average_transaction_value, and nothing else. A second derived metric is a
    decision, not a drift — add it here when it is made.
    """
    assert [(p, n) for p, n, _, _ in DERIVED] == [("metrics", "average_transaction_value")]


@pytest.mark.parametrize("path,name,mdef,reg", DERIVED, ids=[n for _, n, _, _ in DERIVED])
def test_a_derived_metric_declares_a_formula(path, name, mdef, reg):
    for f in req(DEFS, "metric_model.derived.required_fields"):
        assert f in mdef, f"{path}.{name} lacks {f}"
    assert mdef["formula"]["operation"] in req(DEFS, "metric_model.derived.operations")


@pytest.mark.parametrize("path,name,mdef,reg", DERIVED, ids=[n for _, n, _, _ in DERIVED])
def test_dependencies_exist_in_the_same_registry_and_domain(path, name, mdef, reg):
    f = mdef["formula"]
    for role in ("numerator", "denominator"):
        dep = f[role]
        assert dep in reg, f"{path}.{name}.formula.{role} names {dep!r}, not in {path}"
        assert reg[dep]["domain"] == mdef["domain"], (
            f"{path}.{name} is {mdef['domain']}; its {role} {dep} is {reg[dep]['domain']}"
        )
        assert reg[dep]["kind"] == "base", (
            f"{path}.{name} depends on {dep}, which is itself derived — one level only"
        )


@pytest.mark.parametrize("path,name,mdef,reg", DERIVED, ids=[n for _, n, _, _ in DERIVED])
def test_grains_agree(path, name, mdef, reg):
    """
    A ratio of a line-grain measure over a transaction-grain count would be a
    number belonging to neither grain.
    """
    f = mdef["formula"]
    grains = {reg[f["numerator"]]["grain"], reg[f["denominator"]]["grain"]}
    assert len(grains) == 1, f"{path}.{name}: component grains differ: {grains}"
    assert mdef["grain"] in grains, f"{path}.{name}: grain {mdef['grain']!r} is not its components'"
    assert mdef["source_table"] == reg[f["numerator"]]["source_table"]


@pytest.mark.parametrize("path,name,mdef,reg", DERIVED, ids=[n for _, n, _, _ in DERIVED])
def test_grouping_is_no_broader_than_the_dependencies_allow(path, name, mdef, reg):
    f = mdef["formula"]
    allowed = set(reg[f["numerator"]]["valid_group_by"]) & set(reg[f["denominator"]]["valid_group_by"])
    extra = set(mdef["valid_group_by"]) - allowed
    assert not extra, f"{path}.{name} allows grouping by {sorted(extra)}, which a component does not"


@pytest.mark.parametrize("path,name,mdef,reg", DERIVED, ids=[n for _, n, _, _ in DERIVED])
def test_guards_are_the_dependencies_guards(path, name, mdef, reg):
    """Same population as both components: the same filters, in the same words."""
    f = mdef["formula"]
    assert mdef["filters"] == reg[f["numerator"]]["filters"] == reg[f["denominator"]]["filters"]
    assert mdef["date_column"] == reg[f["numerator"]]["date_column"]


@pytest.mark.parametrize("path,name,mdef,reg", DERIVED, ids=[n for _, n, _, _ in DERIVED])
def test_the_executable_sql_is_the_declared_structure(path, name, mdef, reg):
    """
    THE test. The SQL is the source of truth; the formula must describe it
    exactly, with the components' own SQL inserted into the operation's
    template. Anything else is a definition stated twice that could disagree.
    """
    f = mdef["formula"]
    template = req(DEFS, f"metric_model.derived.operations.{f['operation']}.sql_template")
    places = req(DEFS, f["decimal_places_ref"])
    expected = template.format(
        numerator=reg[f["numerator"]]["sql"],
        denominator=reg[f["denominator"]]["sql"],
        decimal_places=places,
    )
    assert mdef["sql"] == expected, (
        f"{path}.{name}.sql is\n  {mdef['sql']}\nbut its formula says\n  {expected}"
    )


@pytest.mark.parametrize("path,name,mdef,reg", DERIVED, ids=[n for _, n, _, _ in DERIVED])
def test_an_undefined_ratio_is_null_with_a_fingerprinted_notice(path, name, mdef, reg):
    op = req(DEFS, f"metric_model.derived.operations.{mdef['formula']['operation']}")
    assert op["undefined_value"] is None, "an undefined ratio is NULL, never zero"
    kind = mdef["undefined_notice_kind"]
    assert kind == op["undefined_notice_kind"]
    assert "must_convey" in req(DEFS, f"notices.{kind}")
    # And the SQL really does guard the denominator.
    assert "NULLIF(" in mdef["sql"]


@pytest.mark.parametrize("path,name,mdef,reg", DERIVED, ids=[n for _, n, _, _ in DERIVED])
def test_every_diagnostic_points_at_a_real_sql_fragment(path, name, mdef, reg):
    for dname, ref in (mdef.get("diagnostics") or {}).items():
        sql = req(DEFS, ref)
        assert isinstance(sql, str) and sql.strip().upper().startswith("COUNT"), (dname, ref)


def test_the_model_never_takes_a_formula_from_the_model():
    assert req(DEFS, "metric_model.derived.formula_source") == "definitions_only"


# ---------------------------------------------------------------------------
# The decisions ATP inherits, written down where a tool reads them
# ---------------------------------------------------------------------------

def test_zero_total_transactions_are_decided_on_transaction_count_not_on_atp():
    tc = req(DEFS, "metrics.transaction_count")
    assert tc["zero_total_transactions_counted"] is True
    atp = req(DEFS, "metrics.average_transaction_value")
    assert atp["formula"]["denominator"] == "transaction_count"
    assert atp["diagnostics"]["zero_total_transactions"] == (
        "metrics.transaction_count.zero_total_diagnostic_sql"
    )


def test_atp_is_retail_only_and_vending_has_no_derived_metric():
    assert req(DEFS, "metrics.average_transaction_value.domain") == "retail_sales"
    assert all(m["kind"] == "base" for m in req(DEFS, "vending.metrics").values())
    assert "vending.revenue_per_order" in req(DEFS, "metric_model.candidates_not_defined")


def test_additive_entries_carry_their_introduction_date_and_the_version_did_not_bump():
    """version_policy: adding a metric does not move the ground under saved rules."""
    assert req(DEFS, "version") == 1
    assert req(DEFS, "version_policy.additive_entries_carry") == "introduced"
    assert req(DEFS, "metrics.average_transaction_value.introduced") == "2026-09-07"
    assert req(DEFS, "comparisons.previous_period.introduced") == "2026-09-07"


def test_a_metric_set_is_guidance_and_executes_nothing():
    for name, s in req(DEFS, "metric_sets").items():
        assert s["executes_nothing"] is True, name
        reg = req(DEFS, "metrics")
        for m in s["metrics"]:
            assert m in reg and reg[m]["domain"] == s["domain"], (name, m)


def test_ffr_is_recorded_as_unavailable_not_stubbed():
    """
    No FFR metric, domain or example exists anywhere in the definitions. The
    limitation is a data-availability record, and only that.
    """
    ffr = req(DEFS, "data_availability.ffr")
    assert ffr["available"] is False
    assert ffr["requires"]
    domains = {spec["domain"] for spec in req(DEFS, "metric_model.registries").values()}
    assert "ffr" not in {d.lower() for d in domains}
    for path, reg in _registries().items():
        for name in reg:
            assert "attach" not in name and "ffr" not in name.lower(), f"{path}.{name}"


# ---------------------------------------------------------------------------
# The tool surface sees the model
# ---------------------------------------------------------------------------

def test_the_sales_schema_offers_the_derived_metric():
    pytest.importorskip("psycopg")
    pytest.importorskip("anthropic")
    from agent import loop as george_loop

    schema = next(s for s in george_loop.build_tool_schemas() if s["name"] == "get_sales")
    assert "average_transaction_value" in schema["input_schema"]["properties"]["metric"]["enum"]


# ---------------------------------------------------------------------------
# Comparisons reach the model as a closed vocabulary, and the prompt says
# what the model may and may not compute
# ---------------------------------------------------------------------------

def _george_loop():
    pytest.importorskip("psycopg")
    pytest.importorskip("anthropic")
    from agent import loop as george_loop
    return george_loop


def test_the_sales_schema_offers_exactly_the_supported_comparisons():
    schema = next(s for s in _george_loop().build_tool_schemas() if s["name"] == "get_sales")
    prop = schema["input_schema"]["properties"]["compare_to"]
    offered = sorted(k for k, v in req(DEFS, "comparisons").items()
                     if isinstance(v, dict) and "get_sales" in (v.get("applies_to") or []))
    assert prop["enum"] == offered
    assert set(offered) == {"previous_period", "same_weekday_last_week", "to_date_same_elapsed"}
    assert "compare_to" not in schema["input_schema"]["required"]
    # What was declined is documentation, never a choice offered.
    for declined in req(DEFS, "comparisons.not_supported"):
        assert declined not in prop["enum"]


def test_no_other_tool_offers_a_comparison_yet():
    loop = _george_loop()
    for s in loop.build_tool_schemas():
        if s["name"] == "get_sales":
            continue
        if s["name"] in loop.one_call.FUNCTIONS:
            # P2S.10: asked as one call and run as get_sales reads, which make
            # the comparison — so it may offer only ones get_sales computes.
            offered = (s["input_schema"]["properties"].get("compare_to") or {}).get("enum") or []
            sales = next(t for t in loop.build_tool_schemas() if t["name"] == "get_sales")
            assert set(offered) <= set(sales["input_schema"]["properties"]["compare_to"]["enum"])
            continue
        assert "compare_to" not in s["input_schema"]["properties"], s["name"]


def test_a_pin_may_hold_a_comparison():
    """compare_to is an ordinary argument, so a compared figure can be a tile."""
    pytest.importorskip("sqlalchemy")
    from app.services.pin_runner import validate_call
    name, args = validate_call({"tool": "get_sales", "arguments": {
        "group_by": "store", "date_range": "last_week", "metric": "net_sales",
        "compare_to": "previous_period",
    }})
    assert args["compare_to"] == "previous_period"


def test_a_pin_cannot_hold_a_comparison_the_definitions_do_not_support():
    pytest.importorskip("sqlalchemy")
    from app.services.pin_runner import PinValidationError, validate_call
    with pytest.raises(PinValidationError, match="no longer a valid value"):
        validate_call({"tool": "get_sales", "arguments": {
            "group_by": [], "date_range": "last_week", "metric": "net_sales",
            "compare_to": "same_period_last_year",
        }})


