"""Pydantic models = schema của FRONTEND_BACKEND_CONTRACT v0.2. OpenAPI (/openapi.json) sinh từ đây."""
from typing import Annotated, Any, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

Month = Annotated[str, Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$", examples=["2001-01"])]
BBox = tuple[float, float, float, float]          # [west, south, east, north]


# ---------- Request ----------
class PresetRegion(BaseModel):
    type: Literal["preset"]
    id: str
    name: Optional[str] = None


class BBoxRegion(BaseModel):
    type: Literal["bbox"]
    bbox: BBox
    name: Optional[str] = None


class GeoJSONRegion(BaseModel):
    """Tạm hỗ trợ để khớp frontend hiện tại: điểm → ô 1° chứa điểm; polygon → khung bao (kèm warning)."""
    type: Literal["geojson"]
    geometry: dict[str, Any]
    name: Optional[str] = None


RegionRef = Annotated[Union[PresetRegion, BBoxRegion, GeoJSONRegion], Field(discriminator="type")]


class SeriesRequest(BaseModel):
    variable_id: str
    region: RegionRef
    start: Month
    end: Month


class TrendRequest(SeriesRequest):
    method: Literal["seasonal_mk"] = "seasonal_mk"
    alpha: float = Field(0.05, gt=0, lt=0.5)


class CompareRequest(BaseModel):
    variable_id: str
    region_a: RegionRef
    region_b: RegionRef
    start: Month
    end: Month
    method: Literal["seasonal_mk"] = "seasonal_mk"
    alpha: float = Field(0.05, gt=0, lt=0.5)


class ExplainContext(BaseModel):
    trend_ids: list[str] = []
    variable_id: Optional[str] = None
    region: Optional[RegionRef] = None
    period: Optional[str] = Field(None, description='"YYYY-MM/YYYY-MM" hoặc "YYYY-YYYY"')


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ExplainRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    context: ExplainContext = Field(default_factory=ExplainContext)
    history: list[ChatTurn] = []


# ---------- Response ----------
class DataSource(BaseModel):
    product: str
    version: str
    provider: str
    url: str
    citation: Optional[str] = None


class Quality(BaseModel):
    n_months: int
    missing_months: int
    coverage_fraction: float
    sufficient: bool


class Coverage(BaseModel):
    start: Month
    end: Month


class VariableItem(BaseModel):
    id: str
    parameter: str = Field(description="Biến môi trường người dùng chọn trước (vd. air_temperature)")
    parameter_name: str
    dataset_name: str = Field(description="Dataset của parameter đó (vd. MERRA-2 (land and sea))")
    name: str
    category: str
    description_simple: str
    description_technical: str
    units: str
    display_units: str
    temporal_resolution: str
    spatial_resolution_deg: float
    native_resolution_deg: float
    coverage: Optional[Coverage]
    extent: Optional[BBox] = Field(None, description="Vùng có dữ liệu [W, S, E, N]; ngoài vùng này → NO_DATA")
    available: bool
    source: DataSource


class VariablesResponse(BaseModel):
    variables: list[VariableItem]


class RegionItem(BaseModel):
    id: str
    name: str
    bbox: BBox
    is_demo: bool


class Limits(BaseModel):
    max_bbox_area_deg2: float
    min_cells: int
    cell_size_deg: float


class RegionsResponse(BaseModel):
    regions: list[RegionItem]
    limits: Limits


class RegionOut(BaseModel):
    type: str
    id: Optional[str] = None
    name: Optional[str] = None
    bbox: BBox


class SeriesPoint(BaseModel):
    t: Month
    value: Optional[float]
    anomaly: Optional[float]
    valid_fraction: float


class SeriesResponse(BaseModel):
    variable_id: str
    region: RegionOut
    units: str
    points: list[SeriesPoint]
    climatology: list[Optional[float]]
    quality: Quality
    source: DataSource
    warnings: list[str]


class TrendLinePoint(BaseModel):
    t: Month
    value: float


class TrendResponse(BaseModel):
    trend_id: str
    variable_id: str
    region: RegionOut
    start: Month
    end: Month
    units: str
    method: str
    slope_method: str
    slope_per_decade: Optional[float]
    slope_ci: Optional[tuple[float, float]]
    ci_method: str
    ci_level: float
    p_value: Optional[float]
    p_value_autocorr_adjusted: Optional[float]
    z: Optional[float]
    tau: Optional[float]
    alpha: float
    significant: Optional[bool]
    direction: Literal["increasing", "decreasing", "no_trend"]
    n: int
    autocorrelation_adjusted: bool
    trend_line: list[TrendLinePoint]
    quality: Quality
    plain_summary: str
    source: DataSource
    warnings: list[str]


class GridCell(BaseModel):
    lon: float
    lat: float
    slope_per_decade: Optional[float]
    p_value: Optional[float]
    q_value: Optional[float]
    significant_fdr: Optional[bool]
    valid: bool


class ValueRange(BaseModel):
    min_slope: float
    max_slope: float


class GridResponse(BaseModel):
    variable_id: str
    units: str
    start: Month
    end: Month
    cell_size_deg: float
    fdr_method: str
    alpha: float
    value_range: ValueRange
    cells: list[GridCell]
    precomputed: bool
    warnings: list[str]


class ValueCell(BaseModel):
    lon: float
    lat: float
    value: Optional[float]
    valid_fraction: float


class ValueRangeFull(BaseModel):
    min: float
    max: float
    p02: float = Field(description="Phân vị 2%: nên dùng làm đầu thang màu để ô cực trị không làm nhạt cả bản đồ")
    p98: float


class ValueGridResponse(BaseModel):
    variable_id: str
    units: str
    start: Month
    end: Month
    stat: Literal["mean"]
    month: Optional[int] = Field(None, description="1–12: chỉ lấy trung bình các tháng này (vd. 7 = các tháng 7)")
    cell_size_deg: float
    value_range: ValueRangeFull
    cells: list[ValueCell]
    warnings: list[str]


class Difference(BaseModel):
    slope_diff_per_decade: Optional[float]
    ci: Optional[tuple[float, float]]
    p_value: Optional[float]
    significant: bool
    stable_halves: Optional[bool]
    test: str


class CompareResponse(BaseModel):
    compare_id: str
    a: TrendResponse
    b: TrendResponse
    difference: Difference
    is_contradiction: bool
    verdict: Literal["opposite_significant", "opposite_not_significant", "same_direction", "insufficient_data"]
    plain_summary: str
    warnings: list[str]


class CitedNumber(BaseModel):
    label: str
    value: float
    units: str
    source_field: str


class Action(BaseModel):
    type: Literal["run_trend", "run_series", "run_compare", "show_grid"]
    params: dict[str, Any]


class ExplainResponse(BaseModel):
    answer: str
    cited_numbers: list[CitedNumber]
    actions: list[Action]
    disclaimer: str
    model: str
    warnings: list[str]


class HealthResponse(BaseModel):
    status: str
    version: str
    available_variables: list[str]


# ---------- Chat (optional Gemini enhancement; /explain remains unchanged) ----------
ChatText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


class ChatContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    variable_id: Optional[str] = None
    dataset_id: Optional[str] = Field(None, description="Exact catalog source.product, e.g. GPM_3IMERGM")
    region: Optional[RegionRef] = None
    start: Optional[Month] = None
    end: Optional[Month] = None
    trend_id: Optional[str] = None
    region_b: Optional[RegionRef] = None
    intent: Optional[Literal["trend", "compare", "series", "provenance", "advisor"]] = None
    parameter: Optional[str] = Field(None, max_length=80)

    @model_validator(mode="after")
    def paired_period(self):
        if (self.start is None) != (self.end is None):
            raise ValueError("context.start and context.end must be supplied together")
        return self


class ChatHistoryTurn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: ChatText


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: ChatText
    context: ChatContext = Field(default_factory=ChatContext)
    history: list[ChatHistoryTurn] = Field(default_factory=list, max_length=24)
    use_tools: bool = False
    # Presentation preference only. It may change tone and depth of wording, never evidence, tools, numbers or
    # decision rules. None keeps the original (pre dual-audience) wording.
    audience_mode: Literal["explorer", "scientist"] | None = None


class ChatWarning(BaseModel):
    code: Literal["TEMPLATE_MODE", "ANALYSIS_WARNING", "CONTEXT_REQUIRED", "UNSUPPORTED_QUESTION", "LLM_FALLBACK"]
    message: str


class ChatEvidence(BaseModel):
    trend: TrendResponse
    cited_numbers: list[CitedNumber]
    scientific_advice: 'MethodAdvice | None' = None


class ChatActionParams(BaseModel):
    variable_id: str
    region: Union[PresetRegion, BBoxRegion]
    start: Month
    end: Month
    region_b: Optional[Union[PresetRegion, BBoxRegion]] = None


class ChatAction(BaseModel):
    type: Literal["navigate"]
    page: Literal["explore", "hunt", "report"]
    label: str
    params: ChatActionParams


class RegionCatalog(BaseModel):
    catalog: RegionsResponse
    supported_selection_types: list[Literal["preset", "bbox"]]


class Provenance(BaseModel):
    variable: VariableItem
    processing_notes: list[str]


class ToolWarning(BaseModel):
    code: Literal["ANALYSIS_WARNING", "LIMITATION"]
    message: str


class ToolError(BaseModel):
    category: Literal["invalid_input", "unsupported_dataset", "unknown_region", "no_observations",
                      "computation_failed", "service_unavailable", "resource_limit", "unknown_tool"]
    message: str
    retryable: bool = False


from .scientific_schemas import MethodAdvice

ToolData = Union[VariablesResponse, RegionCatalog, SeriesResponse, TrendResponse, CompareResponse, Provenance, MethodAdvice]


class ToolResult(BaseModel):
    tool: str
    ok: bool
    data: ToolData | None = None
    warnings: list[ToolWarning] = Field(default_factory=list)
    provenance: list[DataSource] = Field(default_factory=list)
    error: ToolError | None = None


class ChatResponse(BaseModel):
    answer: str
    mode: Literal["template", "llm"]
    evidence: list[ChatEvidence]
    warnings: list[ChatWarning]
    actions: list[ChatAction]
    disclaimer: str
    analysis_id: Optional[str] = None
    tool_results: list[ToolResult] = Field(default_factory=list)
    resolved_context: Optional[ChatContext] = None
    clarification: Optional[str] = None
    suggested_questions: list[str] = Field(default_factory=list)
