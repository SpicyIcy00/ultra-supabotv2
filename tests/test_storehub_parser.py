"""
Tests for the StoreHub CSV parser.

NO DATABASE. The parser is pure, so these run anywhere — see conftest, which
deliberately exempts them from the read-only-role skip.

Every case below is a trap taken from the real 2026-09-02 exports, not an
invented edge case. Where a value looks odd (a header total of "0.00", a unit
cost with six decimals, a double space inside a store name) it is odd because
the real file is.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.services.storehub_parser import (
    StorehubParseError,
    parse,
    resolve_location,
    load_defs,
)

PO_HEADER = (
    '"P.O ID","Created Date","Estimated Date of Arrival","Completion Date",'
    '"Supplier","Target Store","No.","Product Name","SKU","Serial No.","Category",'
    '"Ordered Quantity","Received Quantity","Cost (RM)","SubTotal (RM)","Total (RM)",'
    '"Status","Notes","Requested By","Cancelled By","Cancelled Date","Completed By"'
)

ST_HEADER = (
    '"S.T ID","Created Date","Shipped Date","Received Date","Source Store",'
    '"Target Store","No.","Product Name","SKU","Serial No.","Category","Ordered Qty",'
    '"Cost (RM)","SubTotal (RM)","Total (RM)","Status","Sent By","Cancelled By",'
    '"Cancelled Date","Received By"'
)


def _po(*rows: str) -> bytes:
    return ("\n".join([PO_HEADER, *rows]) + "\n").encode("utf-8")


def _st(*rows: str) -> bytes:
    return ("\n".join([ST_HEADER, *rows]) + "\n").encode("utf-8")


# ---------------------------------------------------------------------------
# Header vs line discrimination
# ---------------------------------------------------------------------------

def test_zero_valued_header_and_line_are_not_confused():
    """
    PO0709's header carries Total "0.00" and its only line carries SubTotal
    "0.00". Testing either column for non-emptiness misclassifies one of them;
    `No.` is the discriminator.
    """
    data = _po(
        '"PO0709","09/02/2026 14:48","09/02/2026","","Supplies","AJI BARN","","","","","",'
        '"","","","","0.00","Open","Received September 2, 2026","Atay Arjel","","",""',
        '"PO0709","09/02/2026 14:48","09/02/2026","","Supplies","AJI BARN","1","Red Eco Bag",'
        '"","","Store supplies","1200","","0.00","0.00","","Open",'
        '"Received September 2, 2026","Atay Arjel","","",""',
    )
    result = parse(data, "purchase_orders")

    assert len(result.documents) == 1
    doc = result.documents[0]
    assert doc.external_id == "PO0709"
    assert doc.header["header_total"] == Decimal("0.00")
    assert len(doc.lines) == 1
    assert doc.lines[0].line_no == 1
    assert doc.lines[0].subtotal == Decimal("0.00")


def test_blank_sku_is_absent_not_unmatched():
    """"Red Eco Bag" carries no SKU. That is a different fact from a SKU that
    failed to match, and the two must stay distinguishable."""
    data = _po(
        '"PO0709","09/02/2026 14:48","09/02/2026","","Supplies","AJI BARN","","","","","",'
        '"","","","","0.00","Open","","Atay Arjel","","",""',
        '"PO0709","09/02/2026 14:48","09/02/2026","","Supplies","AJI BARN","1","Red Eco Bag",'
        '"","","Store supplies","1200","","0.00","0.00","","Open","","Atay Arjel","","",""',
    )
    line = parse(data, "purchase_orders").documents[0].lines[0]
    assert line.sku_raw is None
    assert line.sku_match == "absent"


# ---------------------------------------------------------------------------
# Locations
# ---------------------------------------------------------------------------

def test_opus_double_space_resolves():
    """"(6) Aji Ichiban  OPUS" contains a double space. It must match verbatim."""
    store_id, resolved, notice = resolve_location("(6) Aji Ichiban  OPUS", load_defs())
    assert resolved is True
    assert store_id == "68c5bb269da1d500073690c2"
    assert notice is None


def test_single_space_opus_does_not_resolve():
    """Whitespace is not normalised. A near-miss surfaces instead of matching."""
    store_id, resolved, _ = resolve_location("(6) Aji Ichiban OPUS", load_defs())
    assert resolved is False
    assert store_id is None


def test_prefixed_rockwell_resolves_and_unprefixed_twin_does_not():
    """
    The load-bearing one. "(1) Aji Ichiban Food Products" is Rockwell; the
    unprefixed twin is a different store with no trading history. A prefix-strip
    or LIKE match would route Rockwell's transfers to it.
    """
    defs = load_defs()
    store_id, resolved, _ = resolve_location("(1) Aji Ichiban Food Products", defs)
    assert (store_id, resolved) == ("6639efd54694700008d7ccc6", True)

    store_id, resolved, notice = resolve_location("Aji Ichiban Food Products", defs)
    assert resolved is False
    assert store_id is None
    assert "unestablished" in notice["message"]


def test_every_location_in_the_real_exports_now_resolves():
    """
    The alias map is complete as of 2026-09-02: all 17 ids verified against the
    live stores table, and a parse of all five exports reports zero unresolved
    locations. AJI VENDO was the last one, read from the live table.
    """
    defs = load_defs()
    assert defs["storehub"]["locations"]["pending"] == {}
    store_id, resolved, notice = resolve_location("AJI VENDO", defs)
    assert (store_id, resolved, notice) == ("69b6fb6d185092000783c8a4", True, None)


def test_a_genuinely_unknown_location_imports_with_null_fk_and_one_notice():
    """
    The mechanism still has to work for a location StoreHub adds tomorrow: null
    FK, raw string kept, one notice per distinct location, and no fuzzy match to
    something that merely looks similar.
    """
    unknown = "AJI SOMEWHERE NEW"
    data = _st(
        f'"ST9001","09/02/2026 16:20","","","{unknown}","AJI BARN","","","","","","","",'
        '"","100.00","Created","","","",""',
        f'"ST9001","09/02/2026 16:20","","","{unknown}","AJI BARN","1","Thing","SKU1","",'
        '"indi","10","10.00","100.00","","Created","","","",""',
        f'"ST9002","09/02/2026 16:21","","","{unknown}","AJI BARN","","","","","","","",'
        '"","50.00","Created","","","",""',
        f'"ST9002","09/02/2026 16:21","","","{unknown}","AJI BARN","1","Thing","SKU1","",'
        '"indi","5","10.00","50.00","","Created","","","",""',
    )
    result = parse(data, "stock_transfers")

    for doc in result.documents:
        assert doc.header["source_store_id"] is None
        assert doc.header["source_location_resolved"] is False
        assert doc.header["source_location_raw"] == unknown       # raw string kept
        assert doc.header["target_store_id"] == "667bde393126e50006c8058c"

    # Two documents, two unresolved locations counted, but one notice.
    assert result.counters["unresolved_locations"] == 2
    assert len([n for n in result.notices if n.get("location") == unknown]) == 1


# ---------------------------------------------------------------------------
# Numbers
# ---------------------------------------------------------------------------

def test_six_decimal_cost_survives_and_rounded_subtotal_is_tolerated():
    """
    PCON03: 30 x 1.018028 = 30.54084, exported as 30.54. The cost must not be
    rounded to 2dp on the way in, and the 0.00084 gap must not be reported as an
    inconsistency.
    """
    data = _st(
        '"ST9003","09/02/2026 08:53","","","AJI BARN","(5) Ajiichiban food products Magnolia",'
        '"","","","","","","","","30.54","Created","","","",""',
        '"ST9003","09/02/2026 08:53","","","AJI BARN","(5) Ajiichiban food products Magnolia",'
        '"1","Slurp & chew strawberry flavor","PCON03","","indi","30","1.018028","30.54","",'
        '"Created","","","",""',
    )
    line = parse(data, "stock_transfers").documents[0].lines[0]
    assert line.unit_cost == Decimal("1.018028")
    assert line.subtotal == Decimal("30.54")
    assert line.subtotal_consistent is True


def test_genuinely_inconsistent_subtotal_is_flagged_not_raised():
    data = _st(
        '"ST9004","09/02/2026 08:53","","","AJI BARN","AJI ONLINE","","","","","","","","",'
        '"999.00","Created","","","",""',
        '"ST9004","09/02/2026 08:53","","","AJI BARN","AJI ONLINE","1","Thing","SKU1","",'
        '"indi","10","10.00","999.00","","Created","","","",""',
    )
    result = parse(data, "stock_transfers")
    assert result.documents[0].lines[0].subtotal_consistent is False
    assert result.counters["subtotal_mismatches"] == 1
    assert any(n["kind"] == "subtotal_mismatch" for n in result.notices)


def test_unchecked_subtotal_is_none_not_true():
    """No cost means the check could not run. That is not the same as passing."""
    data = _po(
        '"PO9005","09/02/2026 14:46","09/02/2026","","Supplies","AJI BARN","","","","","",'
        '"","","","","0.00","Open","","Atay Arjel","","",""',
        '"PO9005","09/02/2026 14:46","09/02/2026","","Supplies","AJI BARN","1",'
        '"Brown Ziplock plastic 1pc","pack11","","supplies","2700","","","","","Open","",'
        '"Atay Arjel","","",""',
    )
    assert parse(data, "purchase_orders").documents[0].lines[0].subtotal_consistent is None


def test_header_total_mismatch_with_complete_lines_is_flagged_not_raised():
    """
    Two of 151 real purchase orders disagree with their own lines (PO0604 has a
    90,000.00 total and every line cost left at 0.00). Raising on that rejected
    the whole export, so 149 good documents were lost to 2 bad ones. With the
    line numbers complete, nothing was lost in parsing and the document imports
    flagged.
    """
    data = _st(
        '"ST9006","09/02/2026 16:20","","","AJI BARN","(6) Aji Ichiban  OPUS","","","","",'
        '"","","","","1776.00","Created","","","",""',
        '"ST9006","09/02/2026 16:20","","","AJI BARN","(6) Aji Ichiban  OPUS","1","A","KD101",'
        '"","indi","24","18.00","432.00","","Created","","","",""',
        '"ST9006","09/02/2026 16:20","","","AJI BARN","(6) Aji Ichiban  OPUS","2","B","KD103",'
        '"","indi","24","18.00","999.00","","Created","","","",""',
    )
    result = parse(data, "stock_transfers")
    doc = result.documents[0]

    assert doc.header["header_total_reconciles"] is False
    # Both figures survive exactly as exported; neither is adjusted to fit.
    assert doc.header["header_total"] == Decimal("1776.00")
    assert sum(ln.subtotal for ln in doc.lines) == Decimal("1431.00")
    assert result.counters["header_total_mismatches"] == 1
    assert any(n["kind"] == "header_total_mismatch" for n in result.notices)


def test_header_total_mismatch_with_a_missing_line_is_raised():
    """A gap in the line numbers means a line really is unaccounted for."""
    data = _st(
        '"ST9020","09/02/2026 16:20","","","AJI BARN","(6) Aji Ichiban  OPUS","","","","",'
        '"","","","","1776.00","Created","","","",""',
        '"ST9020","09/02/2026 16:20","","","AJI BARN","(6) Aji Ichiban  OPUS","1","A","KD101",'
        '"","indi","24","18.00","432.00","","Created","","","",""',
        # line 2 is absent
        '"ST9020","09/02/2026 16:20","","","AJI BARN","(6) Aji Ichiban  OPUS","3","C","KD102",'
        '"","indi","24","18.00","432.00","","Created","","","",""',
    )
    with pytest.raises(StorehubParseError, match=r"line numbers have gaps at \[2\]"):
        parse(data, "stock_transfers")


def test_reconciling_document_is_marked_true():
    data = _st(
        '"ST9021","09/02/2026 16:20","","","AJI BARN","AJI ONLINE","","","","","","","","",'
        '"20.00","Created","","","",""',
        '"ST9021","09/02/2026 16:20","","","AJI BARN","AJI ONLINE","1","A","SKU1","","indi",'
        '"10","1.00","10.00","","Created","","","",""',
        '"ST9021","09/02/2026 16:20","","","AJI BARN","AJI ONLINE","2","B","SKU2","","indi",'
        '"10","1.00","10.00","","Created","","","",""',
    )
    result = parse(data, "stock_transfers")
    assert result.documents[0].header["header_total_reconciles"] is True
    assert result.counters["header_total_mismatches"] == 0


def test_real_document_totals_reconcile():
    """ST3001 from the export: 432 + 432 + 432 + 480 = 1776.00."""
    data = _st(
        '"ST3001","09/02/2026 16:20","","","AJI BARN","(6) Aji Ichiban  OPUS","","","","",'
        '"","","","","1776.00","Created","","","",""',
        '"ST3001","09/02/2026 16:20","","","AJI BARN","(6) Aji Ichiban  OPUS","1",'
        '"crispy sour gummy grape aliens","KD101","","indi","24","18.00","432.00","",'
        '"Created","","","",""',
        '"ST3001","09/02/2026 16:20","","","AJI BARN","(6) Aji Ichiban  OPUS","2",'
        '"crispy sour gummy lemon aliens","KD103","","indi","24","18.00","432.00","",'
        '"Created","","","",""',
        '"ST3001","09/02/2026 16:20","","","AJI BARN","(6) Aji Ichiban  OPUS","3",'
        '"crispy sour gummy melon aliens","KD102","","indi","24","18.00","432.00","",'
        '"Created","","","",""',
        '"ST3001","09/02/2026 16:20","","","AJI BARN","(6) Aji Ichiban  OPUS","4",'
        '"crispy sour gummy strawberry aliens","KD107","","","24","20.00","480.00","",'
        '"Created","","","",""',
    )
    result = parse(data, "stock_transfers")
    doc = result.documents[0]
    assert len(doc.lines) == 4
    assert doc.header["status"] == "Created"
    assert sum(ln.subtotal for ln in doc.lines) == doc.header["header_total"]


def test_malformed_number_rejects_the_file():
    data = _st(
        '"ST9007","09/02/2026 16:20","","","AJI BARN","AJI ONLINE","","","","","","","","",'
        '"10.00","Created","","","",""',
        '"ST9007","09/02/2026 16:20","","","AJI BARN","AJI ONLINE","1","Thing","SKU1","",'
        '"indi","ten","1.00","10.00","","Created","","","",""',
    )
    with pytest.raises(StorehubParseError, match="not a number"):
        parse(data, "stock_transfers")


# ---------------------------------------------------------------------------
# Received quantity
# ---------------------------------------------------------------------------

def test_blank_received_is_not_zero_and_zero_is_a_difference():
    data = _po(
        '"PO9008","08/27/2026 16:56","08/27/2026","08/30/2026 13:56","Supplies","AJI BARN",'
        '"","","","","","","","","","0.00","Completed","Received August 27, 2026",'
        '"Atay Arjel","","","Tan Isaiah"',
        # blank received — not recorded
        '"PO9008","08/27/2026 16:56","08/27/2026","08/30/2026 13:56","Supplies","AJI BARN",'
        '"1","Correction tape (per pc)","sup008","","supplies","30","","0.00","0.00","",'
        '"Completed","","Atay Arjel","","","Tan Isaiah"',
        # zero received against 5 ordered — recorded, and a real difference
        '"PO9008","08/27/2026 16:56","08/27/2026","08/30/2026 13:56","Supplies","AJI BARN",'
        '"2","staple wire 1 box","STSP15","","Store supplies","5","0","0.00","0.00","",'
        '"Completed","","Atay Arjel","","","Tan Isaiah"',
    )
    result = parse(data, "purchase_orders")
    blank, zero = result.documents[0].lines

    assert blank.received_qty is None
    assert blank.received_differs_from_ordered is False

    assert zero.received_qty == Decimal("0")
    assert zero.received_differs_from_ordered is True
    assert result.counters["received_differs_from_ordered"] == 1


def test_received_exceeding_ordered_is_recorded_not_reconciled():
    data = _po(
        '"PO9009","09/02/2026 16:34","09/02/2026","09/02/2026 16:36","Do rei me","AJI BARN",'
        '"","","","","","","","","","120.00","Completed","","Tan Daniel","","","Tan Daniel"',
        '"PO9009","09/02/2026 16:34","09/02/2026","09/02/2026 16:36","Do rei me","AJI BARN",'
        '"1","Thing","SKU1","","indi","12","120","10.00","120.00","","Completed","",'
        '"Tan Daniel","","","Tan Daniel"',
    )
    line = parse(data, "purchase_orders").documents[0].lines[0]
    assert line.ordered_qty == Decimal("12")
    assert line.received_qty == Decimal("120")     # imported exactly, never clamped
    assert line.received_differs_from_ordered is True


# ---------------------------------------------------------------------------
# Text handling
# ---------------------------------------------------------------------------

def test_notes_with_embedded_newline_and_comma_stay_one_field():
    data = _po(
        '"PO9010","09/02/2026 16:34","09/02/2026","","Dried Fruits DF001","AJI BARN","","",'
        '"","","","","","","","10.00","Open","Fixing inventory, late POS.\nReceived '
        'September 1, 2026","Tan Daniel","","",""',
        '"PO9010","09/02/2026 16:34","09/02/2026","","Dried Fruits DF001","AJI BARN","1",'
        '"Thing","SKU1","","indi","10","","1.00","10.00","","Open","","Tan Daniel","","",""',
    )
    result = parse(data, "purchase_orders")
    assert len(result.documents) == 1               # the newline did not split the document
    header = result.documents[0].header
    assert "\n" in header["notes"]
    assert "Fixing inventory, late POS." in header["notes"]
    assert header["notes_mentions_received"] is True


def test_received_note_is_flagged_but_never_parsed_into_a_date():
    data = _po(
        '"PO9011","08/27/2026 14:36","08/27/2026","","Do rei me","AJI BARN","","","","","",'
        '"","","","","10.00","Open","Received August 26, 2026","Atay Arjel","","",""',
        '"PO9011","08/27/2026 14:36","08/27/2026","","Do rei me","AJI BARN","1","Thing",'
        '"SKU1","","indi","10","","1.00","10.00","","Open","","Atay Arjel","","",""',
    )
    header = parse(data, "purchase_orders").documents[0].header
    assert header["notes_mentions_received"] is True
    assert header["status"] == "Open"               # Open despite the goods having arrived
    assert header["completion_date"] is None
    # No date was extracted anywhere.
    assert not any(k.endswith("received_date") for k in header)


def test_mojibake_name_is_flagged_and_left_alone():
    data = _st(
        '"ST9012","09/02/2026 16:20","","","AJI BARN","AJI ONLINE","","","","","","","","",'
        '"10.00","Created","","","",""',
        '"ST9012","09/02/2026 16:20","","","AJI BARN","AJI ONLINE","1","CafÃ© '
        'biscuits","SKU1","","ccp","10","1.00","10.00","","Created","","","",""',
    )
    result = parse(data, "stock_transfers")
    line = result.documents[0].lines[0]
    assert line.name_mojibake is True
    assert line.product_name_raw == "CafÃ© biscuits"   # unrepaired
    assert result.counters["mojibake_names"] == 1
    assert any(n["kind"] == "mojibake_product_names" for n in result.notices)


# ---------------------------------------------------------------------------
# Dates
# ---------------------------------------------------------------------------

def test_dates_are_manila_aware_and_eta_stays_a_date():
    data = _po(
        '"PO0710","09/02/2026 16:34","09/02/2026","09/02/2026 16:36","Dried Fruits DF001",'
        '"(6) Aji Ichiban  OPUS","","","","","","","","","","10.00","Completed",'
        '"Fixing inventory","Tan Daniel","","","Tan Daniel"',
        '"PO0710","09/02/2026 16:34","09/02/2026","09/02/2026 16:36","Dried Fruits DF001",'
        '"(6) Aji Ichiban  OPUS","1","G35 sampaloc 1g","G35","","per gram","10","10","1.00",'
        '"10.00","","Completed","","Tan Daniel","","","Tan Daniel"',
    )
    header = parse(data, "purchase_orders").documents[0].header

    created = header["created_at_source"]
    assert created.tzinfo is not None
    assert created.utcoffset().total_seconds() == 8 * 3600     # Manila, no DST
    assert (created.year, created.month, created.day, created.hour) == (2026, 9, 2, 16)

    # Date-only column stays a date — not promoted to a midnight timestamp that
    # would appear to precede the PO it belongs to.
    eta = header["estimated_arrival_date"]
    assert not isinstance(eta, type(created))
    assert eta.isoformat() == "2026-09-02"

    # Two minutes from creation to completion: a backdated correction, not a
    # delivery. The parser records it; it does not interpret it.
    assert (header["completion_date"] - created).total_seconds() == 120


# ---------------------------------------------------------------------------
# Structural failures
# ---------------------------------------------------------------------------

def test_unexpected_header_is_rejected():
    bad = (ST_HEADER.replace('"Ordered Qty"', '"Qty Ordered"') + "\n").encode("utf-8")
    with pytest.raises(StorehubParseError, match="does not match the expected"):
        parse(bad, "stock_transfers")


def test_duplicate_document_header_is_rejected():
    data = _st(
        '"ST9013","09/02/2026 16:20","","","AJI BARN","AJI ONLINE","","","","","","","","",'
        '"0.00","Created","","","",""',
        '"ST9013","09/02/2026 16:20","","","AJI BARN","AJI ONLINE","","","","","","","","",'
        '"0.00","Created","","","",""',
    )
    with pytest.raises(StorehubParseError, match="second header row"):
        parse(data, "stock_transfers")


def test_duplicate_line_number_is_rejected():
    data = _st(
        '"ST9014","09/02/2026 16:20","","","AJI BARN","AJI ONLINE","","","","","","","","",'
        '"20.00","Created","","","",""',
        '"ST9014","09/02/2026 16:20","","","AJI BARN","AJI ONLINE","1","A","SKU1","","indi",'
        '"10","1.00","10.00","","Created","","","",""',
        '"ST9014","09/02/2026 16:20","","","AJI BARN","AJI ONLINE","1","B","SKU2","","indi",'
        '"10","1.00","10.00","","Created","","","",""',
    )
    with pytest.raises(StorehubParseError, match="two lines numbered 1"):
        parse(data, "stock_transfers")


def test_line_before_its_header_is_rejected():
    data = _st(
        '"ST9015","09/02/2026 16:20","","","AJI BARN","AJI ONLINE","1","A","SKU1","","indi",'
        '"10","1.00","10.00","","Created","","","",""',
    )
    with pytest.raises(StorehubParseError, match="before any header row"):
        parse(data, "stock_transfers")


def test_header_without_lines_is_a_notice_not_an_error():
    data = _st(
        '"ST9016","09/02/2026 16:20","","","AJI BARN","AJI ONLINE","","","","","","","","",'
        '"0.00","Cancelled","","Tan Daniel","09/02/2026 17:00",""',
    )
    result = parse(data, "stock_transfers")
    assert result.documents[0].lines == []
    assert any(n["kind"] == "document_without_lines" for n in result.notices)


def test_same_sku_twice_in_one_document_is_two_lines():
    """Line number is the identity, not SKU. Merging these would lose a line."""
    data = _st(
        '"ST9017","09/02/2026 16:20","","","AJI BARN","AJI ONLINE","","","","","","","","",'
        '"20.00","Created","","","",""',
        '"ST9017","09/02/2026 16:20","","","AJI BARN","AJI ONLINE","1","Thing","SKU1","",'
        '"indi","10","1.00","10.00","","Created","","","",""',
        '"ST9017","09/02/2026 16:20","","","AJI BARN","AJI ONLINE","2","Thing","SKU1","",'
        '"indi","10","1.00","10.00","","Created","","","",""',
    )
    doc = parse(data, "stock_transfers").documents[0]
    assert len(doc.lines) == 2
    assert [ln.sku_raw for ln in doc.lines] == ["SKU1", "SKU1"]


def test_counters_and_multiple_documents():
    data = _st(
        '"ST9018","09/02/2026 16:20","","","AJI BARN","AJI ONLINE","","","","","","","","",'
        '"10.00","Created","","","",""',
        '"ST9018","09/02/2026 16:20","","","AJI BARN","AJI ONLINE","1","A","SKU1","","indi",'
        '"10","1.00","10.00","","Created","","","",""',
        '"ST9019","09/01/2026 10:17","09/01/2026 10:17","09/01/2026 10:17",'
        '"(6) Aji Ichiban  OPUS","AJI Disposal","","","","","","","","","20.00","Completed",'
        '"Tan Daniel","","","Tan Daniel"',
        '"ST9019","09/01/2026 10:17","09/01/2026 10:17","09/01/2026 10:17",'
        '"(6) Aji Ichiban  OPUS","AJI Disposal","1","B","SKU2","","indi","20","1.00","20.00",'
        '"","Completed","Tan Daniel","","","Tan Daniel"',
    )
    result = parse(data, "stock_transfers")
    assert result.counters["documents_seen"] == 2
    assert result.counters["lines_seen"] == 2
    assert result.line_count == 2
    assert result.counters["unresolved_locations"] == 0

    disposal = [d for d in result.documents if d.external_id == "ST9019"][0]
    assert disposal.header["target_store_id"] == "6699c88bd38fa400074ba3da"
    assert disposal.header["source_store_id"] == "68c5bb269da1d500073690c2"
    assert disposal.header["received_date"] is not None


# ---------------------------------------------------------------------------
# Closed locations
# ---------------------------------------------------------------------------

def test_macopa_resolves_to_its_closed_store_row():
    """
    AJI MACOPA is a closed warehouse with 1,006 historical references. It must
    RESOLVE — the whole point of creating its store row — even though it is
    excluded from current-state questions.
    """
    store_id, resolved, notice = resolve_location("AJI MACOPA", load_defs())
    assert resolved is True
    assert store_id == "local-aji-macopa-wh-0001"
    assert notice is None


def test_macopa_id_is_deliberately_not_a_storehub_objectid():
    """
    A hex-looking id could collide with the real StoreHub ObjectID if it ever
    arrives, binding a thousand documents to the wrong row. It fits the
    String(24) column but cannot be mistaken for an ObjectID.
    """
    defs = load_defs()
    macopa = [c for c in defs["stores"]["closed"] if c["name"] == "AJI MACOPA"][0]
    assert len(macopa["id"]) == 24
    assert not all(c in "0123456789abcdef" for c in macopa["id"])
    assert macopa["id_is_storehub_objectid"] is False
    assert macopa["closed_at"] == "2026-06-24"


def test_closed_location_is_excluded_from_now_but_not_from_history():
    """
    The asymmetry is the point. Excluding MACOPA from history would delete 1,006
    real documents; including it in current state would report an empty shelf
    for a place that is shut.
    """
    defs = load_defs()
    macopa = "local-aji-macopa-wh-0001"
    closed = defs["filters"]["closed_locations"]

    assert macopa in closed["excluded_store_ids"]
    assert closed["applies_to_current_state"] is True
    assert closed["applies_to_history"] is False
    assert closed["empty_result_is_forbidden"] is True

    # Excluded from retail sales, like the other non-storefronts.
    assert macopa in defs["filters"]["excluded_from_sales"]["excluded_store_ids"]
    # Never offered as a live location to ask about.
    assert macopa not in defs["inventory"]["scope_store_ids"]
    for group in ("active_retail", "warehouse", "pending_retail"):
        assert macopa not in [s["id"] for s in defs["stores"][group]]


def test_closed_transfers_still_parse_and_attribute_to_macopa():
    """ST2721 — the last real movement out of MACOPA, and the source of its closing date."""
    data = _st(
        '"ST2721","06/24/2026 20:46","06/24/2026 23:27","06/24/2026 23:27","AJI MACOPA",'
        '"(5) Ajiichiban food products Magnolia","","","","","","","","","4040.00",'
        '"Completed","Atay Arjel","","","Atay Arjel"',
        '"ST2721","06/24/2026 20:46","06/24/2026 23:27","06/24/2026 23:27","AJI MACOPA",'
        '"(5) Ajiichiban food products Magnolia","1","Thing","SKU1","","indi","40","101.00",'
        '"4040.00","","Completed","Atay Arjel","","","Atay Arjel"',
    )
    result = parse(data, "stock_transfers")
    header = result.documents[0].header

    assert header["source_store_id"] == "local-aji-macopa-wh-0001"
    assert header["source_location_resolved"] is True
    assert header["target_store_id"] == "67612230a740d90007464e26"      # Magnolia
    assert result.counters["unresolved_locations"] == 0
    assert header["received_date"].date().isoformat() == "2026-06-24"
