"""Phase 4A: bounded, typed wrappers over existing scientific services. No model execution."""
import json
import threading
from dataclasses import dataclass
from typing import Annotated, Callable, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from . import bridge, catalog, service
from .errors import ApiError
from .scientific_schemas import MethodAdvice
from .schemas import (BBoxRegion, CompareRequest, CompareResponse, DataSource, Month, PresetRegion,
                      RegionsResponse, SeriesRequest, SeriesResponse, TrendRequest, TrendResponse,
                      VariableItem, VariablesResponse, ToolResult, ToolError, ToolWarning, RegionCatalog, Provenance)

MAX_MONTHS = 288
MAX_CELLS = 1000
MAX_AREA = 1000
MAX_RESULT_BYTES = 65536
MAX_ARGUMENT_BYTES = 4096
_computation = threading.BoundedSemaphore(1)


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class EmptyInput(StrictModel):
    pass


class AdvisorInput(StrictModel):
    analysis_id: str = Field(min_length=1, max_length=100)


def _advise(args):
    from .advisor import advise
    return advise(args.analysis_id)


class PresetInput(StrictModel):
    type: Literal["preset"]
    id: str = Field(min_length=1, max_length=80)


class BBoxInput(StrictModel):
    type: Literal["bbox"]
    bbox: list[float] = Field(min_length=4, max_length=4)


ToolRegion = Annotated[Union[PresetInput, BBoxInput], Field(discriminator="type")]


class VariableInput(StrictModel):
    variable_id: str = Field(min_length=1, max_length=80)
    dataset_id: str | None = Field(None, max_length=80)


class PeriodInput(VariableInput):
    start: Month
    end: Month

    @model_validator(mode="after")
    def bounded_period(self):
        a, b = int(self.start[:4]) * 12 + int(self.start[5:]), int(self.end[:4]) * 12 + int(self.end[5:])
        if a > b:
            raise ValueError("start must not be after end")
        if b - a + 1 > MAX_MONTHS:
            raise ValueError("At most 288 months per tool call")
        return self


class AnalysisInput(PeriodInput):
    region: ToolRegion


class ComparisonInput(PeriodInput):
    region_a: ToolRegion
    region_b: ToolRegion


def _region(ref, variable):
    converted = PresetRegion(type="preset", id=ref.id) if ref.type == "preset" else BBoxRegion(type="bbox", bbox=tuple(ref.bbox))
    if converted.type == "preset" and converted.id not in catalog.REGIONS:
        raise ApiError(404, "UNKNOWN_REGION", "Unknown region preset.")
    _, bbox, _ = service.resolve_region(converted)
    w, s, e, n = bbox
    if (e - w) * (n - s) > MAX_AREA:
        raise ApiError(400, "RESOURCE_LIMIT", "Agent regions are limited to 1000 square degrees; select a smaller area.")
    meta = bridge.meta(variable.pipeline_id)
    if meta and ((e - w) / meta["cell_size_deg"] + 1) * ((n - s) / meta["cell_size_deg"] + 1) > MAX_CELLS:
        raise ApiError(400, "RESOURCE_LIMIT", "Agent region exceeds the grid-cell budget.")
    return converted


def _variable(args):
    v = service.get_variable(args.variable_id)
    if args.dataset_id is not None and args.dataset_id != v.product:
        raise ApiError(422, "UNSUPPORTED_DATASET", "Dataset must match the variable's catalog source.product.")
    return v


def _analysis(args, operation):
    v = _variable(args)
    region = _region(args.region, v)
    request = dict(variable_id=v.id, region=region, start=args.start, end=args.end)
    return (TrendResponse.model_validate(service.trends(TrendRequest(**request))) if operation == "trend"
            else SeriesResponse.model_validate(service.series(SeriesRequest(**request))))


def _compare(args):
    v = _variable(args)
    return CompareResponse.model_validate(service.compare(CompareRequest(
        variable_id=v.id, start=args.start, end=args.end,
        region_a=_region(args.region_a, v), region_b=_region(args.region_b, v))))


def _provenance(args):
    v = _variable(args)
    item = next(x for x in service.variables()["variables"] if x["id"] == v.id)
    return Provenance(variable=VariableItem.model_validate(item),
                      processing_notes=[v.description_technical] + ([v.note] if v.note else []))


@dataclass(frozen=True)
class ToolDefinition:
    name: str
    purpose: str
    input_model: type[BaseModel]
    output_model: type[BaseModel]
    run: Callable
    computation: bool = False


_TOOLS = {
    t.name: t for t in [
        ToolDefinition('advise_statistical_method', 'Explain applied, recommended and unsupported methods using an existing server trend ID; never accepts statistical summaries.', AdvisorInput, MethodAdvice, _advise),
        ToolDefinition("list_available_variables", "Discover valid variable and dataset IDs, units, availability and coverage.", EmptyInput, VariablesResponse,
                       lambda _: VariablesResponse.model_validate(service.variables())),
        ToolDefinition("list_available_regions", "Discover authoritative presets and safe spatial selection types.", EmptyInput, RegionCatalog,
                       lambda _: RegionCatalog(catalog=RegionsResponse.model_validate(service.regions()), supported_selection_types=["preset", "bbox"])),
        ToolDefinition("get_time_series", "Read at most 288 monthly observations with quality, units and provenance.", AnalysisInput, SeriesResponse,
                       lambda args: _analysis(args, "series"), True),
        ToolDefinition("analyze_trend", "Compute a regional seasonal MK/Sen trend. Raw and adjusted tests and OLS interval attribution remain distinct.", AnalysisInput, TrendResponse,
                       lambda args: _analysis(args, "trend"), True),
        ToolDefinition("compare_regions", "Compare two regions using the existing anomaly-difference test and block bootstrap; not just opposite slope signs.", ComparisonInput, CompareResponse, _compare, True),
        ToolDefinition("get_dataset_provenance", "Read catalog source, units, coverage, resolution and documented processing notes.", VariableInput, Provenance, _provenance),
    ]
}


def _failure(name, category, message, retryable=False):
    return ToolResult(tool=name if name in _TOOLS else "unknown", ok=False,
                      error=ToolError(category=category, message=message, retryable=retryable))


class ToolRegistry:
    def list_tools(self) -> list[dict]:
        return [{"name": t.name, "purpose": t.purpose, "input_schema": t.input_model.model_json_schema(),
                 "output_schema": t.output_model.model_json_schema()} for t in _TOOLS.values()]

    def execute(self, name: str, arguments: dict) -> ToolResult:
        if name not in _TOOLS:
            return _failure(name, "unknown_tool", "Only registered tools may execute.")
        tool = _TOOLS[name]
        acquired = False
        try:
            if not isinstance(arguments, dict) or len(json.dumps(arguments, allow_nan=False).encode()) > MAX_ARGUMENT_BYTES:
                return _failure(name, "resource_limit", "Tool argument budget exceeded.")
            args = tool.input_model.model_validate(arguments)
            if tool.computation:
                acquired = _computation.acquire(blocking=False)
                if not acquired:
                    return _failure(name, "resource_limit", "Another scientific tool is running; try again later.", True)
            data = tool.run(args)
            warning_text = getattr(data, "warnings", [])
            if isinstance(data, MethodAdvice):
                warning_text = [w.explanation for w in data.warnings]
            sources = ([data.source] if isinstance(data, (SeriesResponse, TrendResponse)) else
                       [data.a.source, data.b.source] if isinstance(data, CompareResponse) else
                       [data.variable.source] if isinstance(data, Provenance) else
                       [v.source for v in data.variables] if isinstance(data, VariablesResponse) else
                       [service.stored_trend(data.analysis_id)['source']] if isinstance(data, MethodAdvice) else [])
            result = ToolResult(tool=name, ok=True, data=data, provenance=sources,
                                warnings=[ToolWarning(code="ANALYSIS_WARNING", message=w) for w in warning_text])
            if len(result.model_dump_json().encode()) > MAX_RESULT_BYTES:
                return _failure(name, "resource_limit", "Serialized tool result exceeds the response budget.")
            return result
        except (ValidationError, ValueError, TypeError, OverflowError):
            return _failure(name, "invalid_input", "Arguments do not match the tool schema or supported period.")
        except ApiError as error:
            categories = {"UNKNOWN_REGION": "unknown_region", "NO_DATA": "no_observations", "DATA_NOT_READY": "service_unavailable",
                          "UNSUPPORTED_DATASET": "unsupported_dataset", "RESOURCE_LIMIT": "resource_limit"}
            category = categories.get(error.code, "invalid_input")
            messages = {"unknown_region": "Unknown region preset.", "no_observations": "No observations for this selection.",
                        "service_unavailable": "The requested data is not available.", "unsupported_dataset": "Dataset and variable do not match.",
                        "resource_limit": "Selection exceeds the agent's spatial budget.", "invalid_input": "Unsupported variable, region or time selection."}
            return _failure(name, category, messages[category], error.retryable)
        except Exception:
            return _failure(name, "computation_failed", "The scientific service could not complete this operation.")
        finally:
            if acquired:
                _computation.release()


registry = ToolRegistry()
