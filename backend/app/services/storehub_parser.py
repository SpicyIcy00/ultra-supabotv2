"""
StoreHub CSV parser — purchase orders and stock transfers.

Pure parsing. NO DATABASE. This module turns file bytes into `ParsedDocument`
objects, resolves locations against the alias map, applies the integrity checks,
and collects notices. Writing those documents, resolving SKUs to products, and
the upsert/converge logic belong to the importer.

Splitting it here is deliberate: the file-shape rules are the part with all the
traps (see below), and keeping them free of a database connection makes them
testable against a fixture in milliseconds.

NO BUSINESS DEFINITION LIVES IN THIS MODULE. Column names, date formats, status
meanings, the location alias map, integrity tolerances and the mojibake markers
are all read from definitions/metrics.yaml (`storehub:`) at runtime. If a rule
is missing there, add it there — do not inline it here.

THE FOUR TRAPS THIS PARSER EXISTS TO AVOID
------------------------------------------
1. Header rows are identified by a BLANK `No.`, not by a populated Total. Real
   header rows carry Total "0.00" and real line rows carry SubTotal "0.00", so
   both of the obvious tests misclassify.

2. Location names are matched EXACTLY. The live stores table holds two rows
   whose names differ only by a "(1) " prefix, and "(6) Aji Ichiban  OPUS"
   contains a double space. No trimming, no case folding, no fuzzy fallback. An
   unknown location resolves to nothing and is reported.

3. Product names are stored verbatim, including UTF-8 mis-decoding. Mojibake is
   FLAGGED, never repaired — a repaired name is indistinguishable from one that
   was always correct.

4. Notes are read with a real CSV parser (they contain embedded newlines and
   commas) and are never mined for the received date they frequently contain.
"""

from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Optional
from zoneinfo import ZoneInfo

import yaml

PARSER_VERSION = "1.0.0"

# The definitions file is shared with George's tools; the LOADER is not. The
# backend runs with cwd=backend (see Procfile), so the repo root is not on
# sys.path and `tools._common` is not importable from here. Resolving the path
# from __file__ keeps both sides reading the same single file.
#   .../backend/app/services/storehub_parser.py -> parents[3] == repo root
DEFS_PATH = Path(__file__).resolve().parents[3] / "definitions" / "metrics.yaml"

_DEFS: Optional[dict] = None


def load_defs() -> dict:
    global _DEFS
    if _DEFS is None:
        if not DEFS_PATH.exists():
            raise FileNotFoundError(
                f"Business definitions not found at {DEFS_PATH}. The StoreHub "
                f"importer reads its column mappings, location aliases and "
                f"status rules from that file and will not guess them."
            )
        with DEFS_PATH.open(encoding="utf-8") as fh:
            _DEFS = yaml.safe_load(fh)
    return _DEFS


def req(node: Any, path: str) -> Any:
    """
    Strict dotted lookup. Mirrors tools/_common.req, including the absence of a
    default: a helper that can fall back to a literal is how a module ends up
    holding its own copy of a definition.
    """
    cur = node
    for part in path.split("."):
        if not isinstance(cur, dict) or part not in cur:
            raise KeyError(
                f"metrics.yaml is missing '{path}'. Add the definition there — "
                f"do not hardcode it in the importer."
            )
        cur = cur[part]
    return cur


class StorehubParseError(ValueError):
    """The file cannot be parsed into documents. Nothing is imported."""


@dataclass
class ParsedLine:
    line_no: int
    product_name_raw: Optional[str] = None
    name_mojibake: bool = False
    sku_raw: Optional[str] = None
    # 'absent' when the export carried no SKU. Left None otherwise — matching a
    # SKU to a product needs the catalog, so the importer fills in
    # exact / none / ambiguous.
    sku_match: Optional[str] = None
    serial_no: Optional[str] = None
    category_raw: Optional[str] = None
    ordered_qty: Optional[Decimal] = None
    received_qty: Optional[Decimal] = None
    received_differs_from_ordered: bool = False
    unit_cost: Optional[Decimal] = None
    subtotal: Optional[Decimal] = None
    subtotal_consistent: Optional[bool] = None
    source_row: int = 0          # 1-based row in the file, for error messages


@dataclass
class ParsedDocument:
    external_id: str
    header: dict[str, Any]       # role -> parsed value, from the header row
    lines: list[ParsedLine] = field(default_factory=list)
    source_row: int = 0


@dataclass
class ParsedFile:
    kind: str
    documents: list[ParsedDocument]
    notices: list[dict]
    counters: dict[str, int]
    parser_version: str = PARSER_VERSION

    @property
    def line_count(self) -> int:
        return sum(len(d.lines) for d in self.documents)


# ---------------------------------------------------------------------------
# Scalar coercion
# ---------------------------------------------------------------------------

def _clean(value: Optional[str]) -> Optional[str]:
    """
    Empty and whitespace-only become None; everything else is returned as-is.

    Note what is NOT done: the value is not stripped. Leading and trailing
    whitespace is significant for location matching, and a value that differs
    from the alias map only by a stray space must surface as unresolved rather
    than be quietly normalised into a match.
    """
    if value is None:
        return None
    return None if value.strip() == "" else value


def _to_decimal(raw: Optional[str], role: str, row: int, defs: dict) -> Optional[Decimal]:
    if raw is None:
        return None
    text = raw.strip()
    if req(defs, "storehub.numeric.strip_thousands_separator"):
        text = text.replace(",", "")
    try:
        return Decimal(text)
    except (InvalidOperation, ValueError):
        raise StorehubParseError(
            f"Row {row}: {role} is {raw!r}, which is not a number. The importer "
            f"does not coerce or default a malformed number — the file is "
            f"rejected so the bad value is visible."
        )


def _to_int(raw: Optional[str], role: str, row: int) -> Optional[int]:
    if raw is None:
        return None
    try:
        return int(raw.strip())
    except ValueError:
        raise StorehubParseError(f"Row {row}: {role} is {raw!r}, which is not an integer.")


def _to_datetime(raw: Optional[str], role: str, row: int, defs: dict) -> Optional[datetime]:
    """
    Parse a Manila wall-clock timestamp into an aware datetime.

    The file carries no offset. Asia/Manila observes no DST
    (metrics.yaml timezone.observes_dst: false), so attaching the zone is
    unambiguous — it never lands in a skipped or repeated hour.
    """
    if raw is None:
        return None
    fmt = req(defs, "storehub.datetime_format")
    tz = ZoneInfo(req(defs, "storehub.timezone"))
    try:
        return datetime.strptime(raw.strip(), fmt).replace(tzinfo=tz)
    except ValueError:
        raise StorehubParseError(
            f"Row {row}: {role} is {raw!r}, which does not match the expected "
            f"format {fmt!r}."
        )


def _to_date(raw: Optional[str], role: str, row: int, defs: dict) -> Optional[date]:
    """
    Parse a date-only column.

    Kept as a date rather than promoted to midnight: the file states no time,
    and a midnight timestamp would make a same-day ETA appear to precede the PO
    that requested it.
    """
    if raw is None:
        return None
    fmt = req(defs, "storehub.date_format")
    try:
        return datetime.strptime(raw.strip(), fmt).date()
    except ValueError:
        raise StorehubParseError(
            f"Row {row}: {role} is {raw!r}, which does not match the expected "
            f"date format {fmt!r}."
        )


def _coerce(role: str, raw: Optional[str], row: int, defs: dict) -> Any:
    types = req(defs, "storehub.field_types")
    if role in types["datetime"]:
        return _to_datetime(raw, role, row, defs)
    if role in types["date"]:
        return _to_date(raw, role, row, defs)
    if role in types["decimal"]:
        return _to_decimal(raw, role, row, defs)
    if role in types["integer"]:
        return _to_int(raw, role, row)
    return raw


# ---------------------------------------------------------------------------
# Text inspection — detectors, never fixers
# ---------------------------------------------------------------------------

def _looks_mojibake(text: Optional[str], defs: dict) -> bool:
    if not text:
        return False
    return any(marker in text for marker in req(defs, "storehub.text.mojibake_markers"))


def _mentions_received(notes: Optional[str], defs: dict) -> bool:
    """
    Flag a note that looks like it records a receipt date.

    Detection only. metrics.yaml storehub.notes.parse_received_date is false and
    no date is extracted: the note is staff prose, and a date mined from it
    would go on to be reported as a measured lead time.
    """
    if not notes or not req(defs, "storehub.notes.detect_received_date_shape"):
        return False
    return bool(re.search(req(defs, "storehub.notes.detection_regex"), notes))


# ---------------------------------------------------------------------------
# Location resolution
# ---------------------------------------------------------------------------

def resolve_location(raw: Optional[str], defs: dict) -> tuple[Optional[str], bool, Optional[dict]]:
    """
    Map an exported location string to a store id.

    Returns (store_id, resolved, notice).

    EXACT STRING MATCH ONLY. The live stores table holds "(1) Aji Ichiban Food
    Products" (Rockwell, 65k transactions) and "Aji Ichiban Food Products" (no
    trading history) as separate rows, so any prefix-strip or LIKE match routes
    real transfers to the wrong store. There is no fallback of any kind, and an
    unknown location never creates a stores row.
    """
    if raw is None:
        return None, False, None

    alias = req(defs, "storehub.locations.alias")
    if raw in alias:
        return alias[raw], True, None

    pending = req(defs, "storehub.locations.pending")
    if raw in pending:
        entry = pending[raw]
        return None, False, {
            "kind": "unresolved_location",
            "message": (
                f"{raw!r} has no row in `stores`, so its documents import with no "
                f"store link. {' '.join(str(entry.get('what', '')).split())} "
                f"Blocked on: {' '.join(str(entry.get('blocked_on', '')).split())}"
            ).strip(),
            "source": f"metrics.yaml: storehub.locations.pending['{raw}']",
            "location": raw,
        }

    unmapped = req(defs, "storehub.locations").get("deliberately_unmapped", {})
    if raw in unmapped:
        return None, False, {
            "kind": "unresolved_location",
            "message": (
                f"{raw!r} is deliberately not aliased: {unmapped[raw]}. It imports "
                f"unresolved rather than being mapped to a store whose identity "
                f"is unestablished."
            ),
            "source": "metrics.yaml: storehub.locations.deliberately_unmapped",
            "location": raw,
        }

    return None, False, {
        "kind": "unresolved_location",
        "message": (
            f"{raw!r} is not in the location alias map, so its documents import "
            f"with no store link. It was NOT fuzzy-matched to a similar name and "
            f"no store row was created. Add it to "
            f"metrics.yaml storehub.locations.alias once its store id is known."
        ),
        "source": "metrics.yaml: storehub.locations.alias",
        "location": raw,
    }


# ---------------------------------------------------------------------------
# The parser
# ---------------------------------------------------------------------------

def parse(data: bytes, kind: str, defs: Optional[dict] = None) -> ParsedFile:
    """
    Parse a StoreHub export into documents.

    Args:
        data: the raw file bytes.
        kind: 'purchase_orders' or 'stock_transfers'.

    Raises StorehubParseError on anything that makes the file untrustworthy —
    an unexpected header, a malformed number, a duplicate document, a line with
    no header, or a header total that disagrees with its lines. A partially
    understood file is not imported.
    """
    defs = defs or load_defs()
    if kind not in ("purchase_orders", "stock_transfers"):
        raise StorehubParseError(f"Unknown export kind {kind!r}.")

    spec = req(defs, f"storehub.{kind}")
    field_map: dict[str, str] = spec["field_map"]
    line_fields: set[str] = set(spec["line_fields"])
    header_fields = {r: c for r, c in field_map.items()
                     if r not in line_fields and r != "external_id"}
    key_column = spec["document_key_column"]
    no_column = req(defs, "storehub.line_discriminator.column")

    text = data.decode(
        req(defs, "storehub.text.decode"),
        errors=req(defs, "storehub.text.decode_errors"),
    )

    # newline="" is required by the csv module so it can handle the newlines
    # embedded inside quoted Notes fields itself. Without it a note breaks a
    # document in half.
    reader = csv.DictReader(io.StringIO(text, newline=""))

    if reader.fieldnames is None:
        raise StorehubParseError("The file is empty — no header row.")

    expected = list(spec["columns"])
    actual = list(reader.fieldnames)
    if actual != expected:
        missing = [c for c in expected if c not in actual]
        extra = [c for c in actual if c not in expected]
        raise StorehubParseError(
            f"The {kind} export header does not match the expected {len(expected)} "
            f"columns.\n  missing: {missing}\n  unexpected: {extra}\n"
            f"  order changed: {missing == [] and extra == []}\n"
            f"The file is rejected rather than read positionally: a moved column "
            f"would import cost as quantity without any error. If StoreHub has "
            f"changed its export, update metrics.yaml storehub.{kind}.columns "
            f"and field_map."
        )

    documents: dict[str, ParsedDocument] = {}
    notices: list[dict] = []
    seen_locations: set[str] = set()
    counters = {
        "documents_seen": 0,
        "lines_seen": 0,
        "unresolved_locations": 0,
        "subtotal_mismatches": 0,
        "header_total_mismatches": 0,
        "mojibake_names": 0,
        "received_differs_from_ordered": 0,
    }

    location_roles = [r for r in ("source_location_raw", "target_location_raw")
                      if r in field_map]

    for offset, row in enumerate(reader):
        row_no = offset + 2                      # +1 for the header, +1 for 1-based
        external_id = _clean(row.get(key_column))
        if external_id is None:
            # A wholly blank line (trailing newline, or a spacer row). Skipped
            # rather than treated as a document with no id.
            if not any(_clean(v) for v in row.values()):
                continue
            raise StorehubParseError(
                f"Row {row_no} has no {key_column} but is not blank. Every row "
                f"must belong to a document."
            )

        raw_no = _clean(row.get(no_column))

        # ---- header row: blank `No.` -------------------------------------
        if raw_no is None:
            if external_id in documents:
                raise StorehubParseError(
                    f"Row {row_no}: {external_id} has a second header row (the "
                    f"first was row {documents[external_id].source_row}). A "
                    f"document must appear once; two headers means two totals "
                    f"and two statuses for one id."
                )
            header: dict[str, Any] = {}
            for role, column in header_fields.items():
                header[role] = _coerce(role, _clean(row.get(column)), row_no, defs)

            # Locations resolve here so an unresolved one is reported once per
            # location rather than once per document.
            for role in location_roles:
                raw_loc = header.get(role)
                store_id, resolved, notice = resolve_location(raw_loc, defs)
                header[role.replace("_raw", "_id").replace("_location", "_store")] = store_id
                header[role.replace("_raw", "_resolved")] = resolved
                if not resolved and raw_loc is not None:
                    counters["unresolved_locations"] += 1
                    if raw_loc not in seen_locations:
                        seen_locations.add(raw_loc)
                        if notice:
                            notices.append(notice)

            if "notes" in header:
                header["notes_mentions_received"] = _mentions_received(
                    header.get("notes"), defs
                )

            documents[external_id] = ParsedDocument(
                external_id=external_id, header=header, source_row=row_no
            )
            counters["documents_seen"] += 1
            continue

        # ---- line row ----------------------------------------------------
        doc = documents.get(external_id)
        if doc is None:
            raise StorehubParseError(
                f"Row {row_no}: line {raw_no} of {external_id} appears before any "
                f"header row for it. A line alone carries no total, status or "
                f"location, so the document cannot be imported."
            )

        values = {role: _coerce(role, _clean(row.get(column)), row_no, defs)
                  for role, column in field_map.items() if role in line_fields}

        line_no = values.get("line_no")
        if line_no is None:
            raise StorehubParseError(f"Row {row_no}: {external_id} line has no {no_column}.")
        if any(existing.line_no == line_no for existing in doc.lines):
            raise StorehubParseError(
                f"Row {row_no}: {external_id} has two lines numbered {line_no}. "
                f"Line number is the line's identity — merging them would lose a "
                f"real line."
            )

        line = ParsedLine(
            line_no=line_no,
            product_name_raw=values.get("product_name_raw"),
            sku_raw=values.get("sku_raw"),
            serial_no=values.get("serial_no"),
            category_raw=values.get("category_raw"),
            ordered_qty=values.get("ordered_qty"),
            received_qty=values.get("received_qty"),
            unit_cost=values.get("unit_cost"),
            subtotal=values.get("subtotal"),
            source_row=row_no,
        )

        line.name_mojibake = _looks_mojibake(line.product_name_raw, defs)
        if line.name_mojibake:
            counters["mojibake_names"] += 1

        # No SKU at all is a different fact from a SKU that failed to match. The
        # importer fills in exact / none / ambiguous for the rest.
        if line.sku_raw is None:
            line.sku_match = "absent"

        # Ordered vs received: recorded, never reconciled. NULL received means
        # "not recorded" and is not a difference; 0 means "recorded as zero" and
        # is one.
        if "received_qty" in line_fields:
            if line.received_qty is not None and line.ordered_qty is not None:
                line.received_differs_from_ordered = line.received_qty != line.ordered_qty
                if line.received_differs_from_ordered:
                    counters["received_differs_from_ordered"] += 1

        # subtotal vs qty x cost — a FLAG, not an error. It fails legitimately
        # on rounding: 30 x 1.018028 = 30.54084, exported as 30.54.
        check = req(defs, "storehub.integrity.subtotal_equals_qty_times_cost")
        if line.subtotal is not None and line.ordered_qty is not None and line.unit_cost is not None:
            gap = abs(line.ordered_qty * line.unit_cost - line.subtotal)
            line.subtotal_consistent = gap <= Decimal(str(check["tolerance"]))
            if not line.subtotal_consistent:
                counters["subtotal_mismatches"] += 1
        else:
            line.subtotal_consistent = None      # not checkable != consistent

        doc.lines.append(line)
        counters["lines_seen"] += 1

    # ---- document-level integrity ----------------------------------------
    header_check = req(defs, "storehub.integrity.header_total_equals_line_subtotals")
    tolerance = Decimal(str(header_check["tolerance"]))

    for doc in documents.values():
        if not doc.lines:
            notices.append({
                "kind": "document_without_lines",
                "message": (
                    f"{doc.external_id} has a header row but no line rows. It "
                    f"imports as an empty document, and any lines it previously "
                    f"had are removed to converge on the file."
                ),
                "source": "metrics.yaml: storehub.idempotency",
                "document": doc.external_id,
            })
            continue

        total = doc.header.get("header_total")
        subtotals = [ln.subtotal for ln in doc.lines if ln.subtotal is not None]
        doc.header["header_total_reconciles"] = None      # not checkable by default

        if total is not None and subtotals:
            gap = abs(sum(subtotals) - total)
            reconciles = gap <= tolerance
            doc.header["header_total_reconciles"] = reconciles

            if not reconciles:
                # Contiguity decides whether this is a lost line or a source
                # inconsistency. See metrics.yaml for the measured evidence and
                # for why a file-level refusal is reserved for the former.
                numbers = sorted(ln.line_no for ln in doc.lines)
                contiguous = numbers == list(range(1, len(numbers) + 1))
                if not contiguous:
                    missing = sorted(set(range(1, max(numbers) + 1)) - set(numbers))
                    raise StorehubParseError(
                        f"{doc.external_id} (row {doc.source_row}): the header total "
                        f"{total} does not equal the sum of its line subtotals "
                        f"({sum(subtotals)}), a difference of {gap}, AND its line "
                        f"numbers have gaps at {missing}. A line is unaccounted "
                        f"for, so the document cannot be trusted. Nothing is "
                        f"imported and no value is adjusted to fit."
                    )
                counters["header_total_mismatches"] += 1
                notices.append({
                    "kind": "header_total_mismatch",
                    "message": (
                        f"{doc.external_id}: the document total {total} does not "
                        f"equal the sum of its {len(doc.lines)} line subtotals "
                        f"({sum(subtotals)}), a difference of {gap}. Its line "
                        f"numbers are complete (1..{len(numbers)}), so no line is "
                        f"missing — the source document itself disagrees. Both "
                        f"figures are imported exactly as exported and neither was "
                        f"adjusted; the document is flagged so a total taken from "
                        f"it carries the caveat."
                    ),
                    "source": "metrics.yaml: storehub.integrity.header_total_equals_line_subtotals",
                    "document": doc.external_id,
                })

    if counters["mojibake_names"]:
        notices.append({
            "kind": "mojibake_product_names",
            "message": (
                f"{counters['mojibake_names']} product name(s) look UTF-8 "
                f"mis-decoded at export. They are stored exactly as exported and "
                f"flagged, not repaired — a repaired name would be "
                f"indistinguishable from one that was always correct."
            ),
            "source": "metrics.yaml: storehub.text.repair_mojibake",
        })

    if counters["subtotal_mismatches"]:
        notices.append({
            "kind": "subtotal_mismatch",
            "message": (
                f"{counters['subtotal_mismatches']} line(s) have a subtotal that "
                f"differs from quantity x unit cost by more than the rounding "
                f"tolerance. Both values are imported exactly as exported; "
                f"neither was adjusted."
            ),
            "source": "metrics.yaml: storehub.integrity.subtotal_equals_qty_times_cost",
        })

    if counters["received_differs_from_ordered"]:
        notices.append({
            "kind": "received_differs_from_ordered",
            "message": (
                f"{counters['received_differs_from_ordered']} line(s) record a "
                f"received quantity that differs from the ordered quantity, in "
                f"either direction. Both are imported exactly as exported and "
                f"are never reconciled to each other."
            ),
            "source": "metrics.yaml: storehub.purchase_orders.received_quantity",
        })

    return ParsedFile(
        kind=kind,
        documents=list(documents.values()),
        notices=notices,
        counters=counters,
    )
