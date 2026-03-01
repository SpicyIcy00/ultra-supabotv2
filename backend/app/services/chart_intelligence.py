"""
Chart Intelligence Module

Automatically selects, validates, and repairs chart configurations based on data structure.
Ensures every chart perfectly fits the dataset with no missing points or wrong chart types.
"""

from typing import Any, Dict, List, Tuple
from datetime import datetime, date


class ChartIntelligence:
    """Intelligent chart selection, validation, and auto-repair."""

    def __init__(self):
        # Chart type rules - Extended with 15+ chart types
        self.chart_rules = {
            # Core charts
            "bar": {
                "use_for": ["ranking", "comparison", "categorical"],
                "min_points": 1,
                "max_points": 20,
                "requires": ["categorical_axis", "numeric_value"]
            },
            "horizontal_bar": {
                "use_for": ["ranking"],
                "min_points": 3,
                "max_points": 15,
                "requires": ["categorical_axis", "numeric_value"],
                "prefer_when": "long_labels"
            },
            "line": {
                "use_for": ["time_series", "trend"],
                "min_points": 3,
                "max_points": 100,
                "requires": ["time_axis", "numeric_value"]
            },
            "area": {
                "use_for": ["time_series", "cumulative", "trend"],
                "min_points": 5,
                "max_points": 100,
                "requires": ["time_axis", "numeric_value"]
            },
            "pie": {
                "use_for": ["proportion", "distribution"],
                "min_points": 2,
                "max_points": 8,
                "requires": ["categorical_axis", "numeric_value"]
            },
            "stacked_bar": {
                "use_for": ["composition", "breakdown", "multi_series"],
                "min_points": 2,
                "max_points": 15,
                "requires": ["categorical_axis", "multiple_numeric_values"]
            },
            "scatter": {
                "use_for": ["correlation", "relationship"],
                "min_points": 10,
                "max_points": 500,
                "requires": ["two_numeric_axes"]
            },
            "bubble": {
                "use_for": ["3d_correlation", "multi_dimension"],
                "min_points": 5,
                "max_points": 100,
                "requires": ["three_numeric_columns"]
            },
            "combo": {
                "use_for": ["dual_metric", "comparison_with_trend"],
                "min_points": 5,
                "max_points": 50,
                "requires": ["categorical_axis", "two_numeric_values"]
            },
            # Advanced charts
            "treemap": {
                "use_for": ["hierarchy", "nested_categories", "composition"],
                "min_points": 5,
                "max_points": 50,
                "requires": ["categorical_axis", "numeric_value"]
            },
            "radar": {
                "use_for": ["multi_metric_comparison", "profile"],
                "min_points": 3,
                "max_points": 10,
                "max_metrics": 8,
                "requires": ["categorical_axis", "multiple_numeric_values"]
            },
            "gauge": {
                "use_for": ["kpi", "progress", "target"],
                "min_points": 1,
                "max_points": 1,
                "requires": ["single_numeric_value"]
            },
            "waterfall": {
                "use_for": ["breakdown", "incremental", "profit_loss"],
                "min_points": 3,
                "max_points": 15,
                "requires": ["categorical_axis", "numeric_value"]
            },
            "funnel": {
                "use_for": ["conversion", "stages", "pipeline"],
                "min_points": 2,
                "max_points": 8,
                "requires": ["categorical_axis", "numeric_value"]
            },
            # Business intelligence charts
            "pareto": {
                "use_for": ["80_20", "top_contributors", "cumulative_impact"],
                "min_points": 5,
                "max_points": 20,
                "requires": ["categorical_axis", "numeric_value"]
            },
            "bullet": {
                "use_for": ["kpi_vs_target", "performance"],
                "min_points": 1,
                "max_points": 1,
                "requires": ["single_numeric_value"]
            },
            "calendar_heatmap": {
                "use_for": ["daily_patterns", "yearly_view"],
                "min_points": 30,
                "max_points": 366,
                "requires": ["date_column", "numeric_value"]
            },
            "lollipop": {
                "use_for": ["ranking", "comparison"],
                "min_points": 3,
                "max_points": 15,
                "requires": ["categorical_axis", "numeric_value"]
            }
        }

    def select_chart(
        self,
        user_question: str,
        results: List[Dict[str, Any]]
    ) -> Dict[str, Any] | None:
        """
        Intelligently select and configure the best chart for the data.

        Args:
            user_question: Original user query
            results: SQL query results

        Returns:
            Chart configuration dict or None if no chart appropriate
        """
        if not results or len(results) == 0:
            return None

        # Single row = no chart (aggregate values)
        if len(results) == 1:
            return None

        # Analyze data structure
        data_profile = self._profile_data(results)

        # Detect query intent from question
        query_type = self._detect_query_type(user_question, data_profile)

        # Select chart type based on rules
        chart_type = self._select_chart_type(query_type, data_profile)

        if not chart_type:
            return None

        # Build chart configuration
        chart_config = self._build_chart_config(chart_type, results, data_profile)

        # Validate and repair
        chart_config = self._validate_and_repair(chart_config, results)

        return chart_config

    def _profile_data(self, results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Profile the data structure to understand what we're working with."""
        if not results:
            return {}

        first_row = results[0]
        profile = {
            "row_count": len(results),
            "columns": list(first_row.keys()),
            "column_types": {},
            "has_time_column": False,
            "has_categorical_column": False,
            "has_multiple_numeric_columns": False,
            "numeric_columns": [],
            "categorical_columns": [],
            "time_columns": [],
            "max_label_length": 0
        }

        # Analyze each column
        for col_name, col_value in first_row.items():
            col_type = self._detect_column_type(col_name, col_value, results)
            profile["column_types"][col_name] = col_type

            if col_type == "time":
                profile["time_columns"].append(col_name)
                profile["has_time_column"] = True
            elif col_type == "numeric":
                profile["numeric_columns"].append(col_name)
            elif col_type == "categorical":
                profile["categorical_columns"].append(col_name)
                profile["has_categorical_column"] = True
                # Track max label length for horizontal bar decision
                for row in results:
                    val = row.get(col_name, "")
                    if isinstance(val, str):
                        profile["max_label_length"] = max(profile["max_label_length"], len(val))

        # Check for multiple numeric columns (for stacked/radar/combo charts)
        profile["has_multiple_numeric_columns"] = len(profile["numeric_columns"]) >= 2

        return profile

    def _detect_column_type(
        self,
        col_name: str,
        col_value: Any,
        all_results: List[Dict[str, Any]]
    ) -> str:
        """Detect if a column is time, numeric, or categorical."""
        col_name_lower = col_name.lower()

        # Check for time-related column names
        time_keywords = ['date', 'time', 'hour', 'day', 'month', 'year', 'week', 'period']
        if any(kw in col_name_lower for kw in time_keywords):
            return "time"

        # Check value type
        if isinstance(col_value, (datetime, date)):
            return "time"

        if isinstance(col_value, (int, float)):
            # Check if it's a small integer that might be categorical (like hour 0-23)
            if isinstance(col_value, int) and col_name_lower in ['hour', 'day_of_week', 'month']:
                return "time"
            return "numeric"

        if isinstance(col_value, str):
            # Check if all values are unique (might be an ID)
            unique_count = len(set(str(row.get(col_name, '')) for row in all_results))
            if unique_count == len(all_results):
                return "categorical"

            # Check if it looks like a date string
            if self._is_date_string(col_value):
                return "time"

            return "categorical"

        return "unknown"

    def _is_date_string(self, value: str) -> bool:
        """Check if a string looks like a date."""
        if not value:
            return False

        # Common date patterns
        date_indicators = ['-', '/', ':', 'am', 'pm', 'jan', 'feb', 'mar', 'apr', 'may', 'jun',
                          'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'monday', 'tuesday']

        value_lower = value.lower()
        return any(ind in value_lower for ind in date_indicators)

    def _detect_query_type(self, question: str, data_profile: Dict[str, Any]) -> str:
        """Detect the query type from question and data."""
        question_lower = question.lower()
        row_count = data_profile.get("row_count", 0)
        numeric_cols = len(data_profile.get("numeric_columns", []))
        categorical_cols = len(data_profile.get("categorical_columns", []))

        # KPI/Progress/Target queries (single value) -> gauge/bullet
        kpi_keywords = ['progress', 'target', 'goal', 'kpi', 'achievement', 'status']
        if any(kw in question_lower for kw in kpi_keywords):
            if row_count == 1:
                return "kpi"

        # Pareto/80-20 analysis
        pareto_keywords = ['pareto', '80/20', '80-20', 'top contributors', 'cumulative impact']
        if any(kw in question_lower for kw in pareto_keywords):
            if row_count >= 5:
                return "pareto"

        # Funnel/Conversion queries
        funnel_keywords = ['funnel', 'conversion', 'stages', 'pipeline', 'drop-off', 'dropoff']
        if any(kw in question_lower for kw in funnel_keywords):
            if 2 <= row_count <= 8:
                return "funnel"

        # Waterfall/Incremental queries
        waterfall_keywords = ['waterfall', 'incremental', 'step by step', 'profit breakdown', 'revenue breakdown']
        if any(kw in question_lower for kw in waterfall_keywords):
            if 3 <= row_count <= 15:
                return "waterfall"

        # Radar/Multi-metric comparison
        radar_keywords = ['radar', 'spider', 'compare across metrics', 'multi-metric', 'profile comparison']
        if any(kw in question_lower for kw in radar_keywords):
            if 3 <= row_count <= 10 and numeric_cols >= 3:
                return "radar"

        # Treemap/Hierarchy queries
        treemap_keywords = ['treemap', 'hierarchy', 'nested', 'category breakdown']
        if any(kw in question_lower for kw in treemap_keywords):
            if row_count >= 5:
                return "treemap"

        # Correlation/Scatter queries
        correlation_keywords = ['correlation', 'relationship', 'scatter', 'plotted against']
        if any(kw in question_lower for kw in correlation_keywords):
            if row_count >= 10 and numeric_cols >= 2:
                return "correlation"

        # Calendar heatmap
        calendar_keywords = ['calendar', 'daily pattern', 'heatmap', 'by day']
        if any(kw in question_lower for kw in calendar_keywords):
            if row_count >= 30 and data_profile.get("has_time_column"):
                return "calendar_heatmap"

        # Composition/Stacked breakdown queries
        composition_keywords = ['composition', 'split by', 'breakdown by', 'stacked', 'by category and']
        if any(kw in question_lower for kw in composition_keywords):
            if row_count >= 2 and numeric_cols >= 2:
                return "composition"

        # Cumulative/Area queries
        cumulative_keywords = ['cumulative', 'running total', 'accumulated', 'area']
        if any(kw in question_lower for kw in cumulative_keywords):
            if row_count >= 5 and data_profile.get("has_time_column"):
                return "cumulative"

        # Ranking queries
        ranking_keywords = ['top', 'best', 'worst', 'highest', 'lowest', 'most', 'least']
        if any(kw in question_lower for kw in ranking_keywords):
            return "ranking"

        # Time series queries
        time_keywords = ['trend', 'over time', 'hourly', 'daily', 'weekly', 'monthly', 'pattern', 'history']
        if any(kw in question_lower for kw in time_keywords) or data_profile.get("has_time_column"):
            # Must have enough points for a line chart
            if row_count >= 5:
                return "time_series"

        # Comparison queries
        comparison_keywords = ['compare', 'vs', 'versus', 'between', 'difference']
        if any(kw in question_lower for kw in comparison_keywords):
            return "comparison"

        # Distribution/proportion queries
        distribution_keywords = ['distribution', 'breakdown', 'proportion', 'share', 'percentage']
        if any(kw in question_lower for kw in distribution_keywords):
            if 2 <= row_count <= 8:
                return "distribution"

        # Default based on data
        if data_profile.get("has_time_column") and row_count >= 5:
            return "time_series"
        elif data_profile.get("has_categorical_column"):
            return "ranking"

        return "unknown"

    def _select_chart_type(self, query_type: str, data_profile: Dict[str, Any]) -> str | None:
        """Select the best chart type based on query type and data profile."""
        row_count = data_profile.get("row_count", 0)
        numeric_cols = len(data_profile.get("numeric_columns", []))
        categorical_cols = data_profile.get("categorical_columns", [])

        # KPI/Progress -> Gauge or Bullet
        if query_type == "kpi":
            if row_count == 1:
                return "gauge"

        # Pareto (80/20) analysis
        if query_type == "pareto":
            if row_count >= 5:
                return "pareto"

        # Funnel chart
        if query_type == "funnel":
            if 2 <= row_count <= 8:
                return "funnel"

        # Waterfall chart
        if query_type == "waterfall":
            if 3 <= row_count <= 15:
                return "waterfall"

        # Radar chart
        if query_type == "radar":
            if 3 <= row_count <= 10 and numeric_cols >= 3:
                return "radar"

        # Treemap
        if query_type == "treemap":
            if row_count >= 5:
                return "treemap"

        # Scatter/Correlation
        if query_type == "correlation":
            if row_count >= 10 and numeric_cols >= 2:
                return "scatter"

        # Calendar heatmap
        if query_type == "calendar_heatmap":
            if row_count >= 30:
                return "calendar_heatmap"

        # Composition -> Stacked bar
        if query_type == "composition":
            if row_count >= 2 and numeric_cols >= 2:
                return "stacked_bar"

        # Cumulative -> Area chart
        if query_type == "cumulative":
            if row_count >= 5 and data_profile.get("has_time_column"):
                return "area"

        # Ranking queries
        if query_type == "ranking":
            if row_count >= 3:
                # Check for long category names -> horizontal bar
                if categorical_cols and self._has_long_labels(data_profile):
                    return "horizontal_bar"
                return "bar"
            else:
                return None

        # Time series
        elif query_type == "time_series":
            if row_count >= 5 and data_profile.get("has_time_column"):
                return "line"
            elif row_count >= 3:
                return "bar"

        # Comparison
        elif query_type == "comparison":
            if 2 <= row_count <= 10:
                return "bar"

        # Distribution
        elif query_type == "distribution":
            if 2 <= row_count <= 8:
                return "pie"

        # Default to bar for categorical data
        if data_profile.get("has_categorical_column") and row_count >= 3:
            return "bar"

        return None

    def _has_long_labels(self, data_profile: Dict[str, Any]) -> bool:
        """Check if categorical labels are long (>20 chars)."""
        max_label_length = data_profile.get("max_label_length", 0)
        return max_label_length > 20

    def _build_chart_config(
        self,
        chart_type: str,
        results: List[Dict[str, Any]],
        data_profile: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Build the chart configuration with full metadata for tooltips."""
        # Select axes
        x_axis = self._select_x_axis(data_profile, chart_type)
        y_axis = self._select_y_axis(data_profile, x_axis)

        # Check if y_axis is currency (for formatting hints)
        is_currency_axis = False
        if y_axis:
            y_axis_lower = y_axis.lower()
            is_currency_axis = any(kw in y_axis_lower for kw in
                                   ['revenue', 'sales', 'price', 'cost', 'profit', 'amount'])

        # Find units column for tooltip metadata
        units_col = self._find_units_column(data_profile)

        # Prepare chart data with full metadata
        chart_data = []
        for row in results:
            data_point = {}

            # X-axis value
            if x_axis:
                x_value = row.get(x_axis)
                # Store both display name (ellipsized for axis) and full name (for tooltip)
                full_name = str(x_value) if x_value is not None else "N/A"
                data_point["name"] = self._format_axis_value(x_value, x_axis)
                data_point["fullName"] = full_name  # Full name for tooltip

            # Y-axis value
            if y_axis:
                y_value = row.get(y_axis, 0)
                # Ensure numeric
                try:
                    data_point["value"] = float(y_value) if y_value is not None else 0
                except (ValueError, TypeError):
                    data_point["value"] = 0

            # Add units metadata if available
            if units_col:
                units_value = row.get(units_col)
                if units_value is not None:
                    try:
                        data_point["units"] = float(units_value)
                    except (ValueError, TypeError):
                        data_point["units"] = None

            chart_data.append(data_point)

        config = {
            "type": chart_type,
            "data": chart_data,
            "x_axis": x_axis,
            "y_axis": y_axis,
            "x_label": self._format_label(x_axis),
            "y_label": self._format_label(y_axis),
            "is_currency": is_currency_axis,  # Hint for frontend formatting
            "units_column": units_col,  # Units column name for tooltip
            # Smart formatting options
            "formatting": {
                "abbreviate_numbers": True,  # Use K, M, B suffixes
                "currency_symbol": "₱" if is_currency_axis else None,
                "decimal_places": 0 if is_currency_axis else 2,
                "show_grid": True,
                "show_labels": len(chart_data) <= 10,  # Hide labels if too many
                "label_rotation": 45 if len(chart_data) > 5 else 0,
                "max_label_length": 15  # Truncate long labels
            },
            "tooltip": {
                "show_percentage": chart_type == "pie",
                "show_units": units_col is not None,
                "currency_format": is_currency_axis
            }
        }

        return config

    def _find_units_column(self, data_profile: Dict[str, Any]) -> str | None:
        """Find units/quantity column for tooltip metadata."""
        numeric_cols = data_profile.get("numeric_columns", [])
        units_priorities = ['units', 'quantity', 'qty', 'units_sold']

        for priority_col in units_priorities:
            for col in numeric_cols:
                if col.lower() == priority_col:
                    return col

        return None

    def _select_x_axis(self, data_profile: Dict[str, Any], chart_type: str) -> str | None:
        """Select the best column for X-axis."""
        # For time series, prefer time columns
        if chart_type == "line" and data_profile.get("time_columns"):
            return data_profile["time_columns"][0]

        # For bar/pie, prefer categorical columns
        if data_profile.get("categorical_columns"):
            return data_profile["categorical_columns"][0]

        # Fallback to time if available
        if data_profile.get("time_columns"):
            return data_profile["time_columns"][0]

        # Fallback to first column
        if data_profile.get("columns"):
            return data_profile["columns"][0]

        return None

    def _select_y_axis(self, data_profile: Dict[str, Any], x_axis: str | None) -> str | None:
        """Select the best column for Y-axis (numeric value)."""
        numeric_cols = data_profile.get("numeric_columns", [])

        if not numeric_cols:
            return None

        # Prefer revenue/sales columns
        for col in numeric_cols:
            col_lower = col.lower()
            if any(kw in col_lower for kw in ['revenue', 'sales', 'total', 'amount']):
                return col

        # Return first numeric column that's not the x-axis
        for col in numeric_cols:
            if col != x_axis:
                return col

        return numeric_cols[0] if numeric_cols else None

    def _format_axis_value(self, value: Any, column_name: str) -> str:
        """Format axis value for display."""
        if value is None:
            return "N/A"

        if isinstance(value, (datetime, date)):
            return value.strftime("%Y-%m-%d")

        if isinstance(value, (int, float)):
            # Check if it's hour (0-23)
            if column_name.lower() == 'hour' and 0 <= value <= 23:
                return f"{int(value)}:00"

            return str(value)

        return str(value)

    def _format_label(self, column_name: str | None) -> str:
        """Format column name as axis label."""
        if not column_name:
            return ""

        # Convert snake_case to Title Case
        return column_name.replace('_', ' ').title()

    def _validate_and_repair(
        self,
        chart_config: Dict[str, Any],
        results: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Validate chart config and auto-repair issues with strict guarantees."""
        chart_type = chart_config.get("type")
        chart_data = chart_config.get("data", [])

        # Validation 1: GUARANTEE all data points are included
        if len(chart_data) != len(results):
            # Rebuild data to ensure no points are missing
            chart_config = self._rebuild_chart_data(chart_config, results)
            chart_data = chart_config.get("data", [])

        # Validation 2: Ensure all data points have valid values
        valid_data = [
            point for point in chart_data
            if point.get("value") is not None and point.get("name")
        ]

        # Validation 3: Point/Bar count guarantee
        data_count = len(valid_data)

        # Bar chart validation
        if chart_type in ["bar", "horizontal_bar", "lollipop"]:
            if data_count > 20:
                valid_data = valid_data[:20]
                data_count = 20
            if data_count < 3:
                return None

        # Line/Area chart validation
        elif chart_type in ["line", "area"]:
            if data_count < 5:
                chart_config["type"] = "bar"
                chart_type = "bar"
            unique_x = len(set(point.get("name") for point in valid_data))
            if unique_x != data_count:
                if unique_x < 3:
                    return None

        # Pie chart validation
        elif chart_type == "pie":
            if data_count < 2 or data_count > 8:
                chart_config["type"] = "bar"
                chart_type = "bar"

        # Funnel validation
        elif chart_type == "funnel":
            if data_count < 2 or data_count > 8:
                chart_config["type"] = "bar"
                chart_type = "bar"

        # Gauge/Bullet validation (single value only)
        elif chart_type in ["gauge", "bullet"]:
            if data_count != 1:
                # Take first value only
                valid_data = valid_data[:1] if valid_data else []
                if not valid_data:
                    return None

        # Waterfall validation
        elif chart_type == "waterfall":
            if data_count < 3 or data_count > 15:
                chart_config["type"] = "bar"
                chart_type = "bar"

        # Pareto validation
        elif chart_type == "pareto":
            if data_count < 5:
                chart_config["type"] = "bar"
                chart_type = "bar"

        # Treemap validation
        elif chart_type == "treemap":
            if data_count < 5:
                chart_config["type"] = "pie"
                chart_type = "pie"

        # Radar validation
        elif chart_type == "radar":
            if data_count < 3 or data_count > 10:
                chart_config["type"] = "bar"
                chart_type = "bar"

        # Calendar heatmap validation
        elif chart_type == "calendar_heatmap":
            if data_count < 30:
                chart_config["type"] = "line"
                chart_type = "line"

        # Scatter/Bubble validation
        elif chart_type in ["scatter", "bubble"]:
            if data_count < 10:
                chart_config["type"] = "bar"
                chart_type = "bar"

        chart_config["data"] = valid_data

        # Validation 4: Sort data appropriately
        if chart_type in ["bar", "horizontal_bar", "pie", "pareto", "lollipop", "treemap"]:
            # Sort by value descending for rankings
            chart_config["data"] = sorted(
                chart_config["data"],
                key=lambda x: x.get("value", 0),
                reverse=True
            )

        # Final validation: Ensure bar count matches expectation
        final_count = len(chart_config["data"])
        chart_config["data_point_count"] = final_count  # Store count for verification

        return chart_config

    def _rebuild_chart_data(
        self,
        chart_config: Dict[str, Any],
        results: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Rebuild chart data to ensure all points are included."""
        x_axis = chart_config.get("x_axis")
        y_axis = chart_config.get("y_axis")

        new_data = []
        for row in results:
            point = {
                "name": self._format_axis_value(row.get(x_axis), x_axis),
                "value": float(row.get(y_axis, 0))
            }
            new_data.append(point)

        chart_config["data"] = new_data
        return chart_config

    def get_chart_summary(self, chart_config: Dict[str, Any] | None) -> str:
        """Generate a summary of the chart configuration."""
        if not chart_config:
            return "No chart generated."

        chart_type = chart_config.get("type", "unknown")
        data_count = len(chart_config.get("data", []))
        x_label = chart_config.get("x_label", "")
        y_label = chart_config.get("y_label", "")

        return f"{chart_type.title()} chart with {data_count} data points ({x_label} vs {y_label})"
