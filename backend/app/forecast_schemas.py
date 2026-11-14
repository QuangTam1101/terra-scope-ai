"""Schemas of the AI forecast endpoints (POST /forecast, GET /forecast/map, /forecast/status, /forecast/reality-check)."""
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

from .schemas import DataSource, Month, RegionOut, RegionRef


# ---------- Forecast (AI) ----------
class ForecastRequest(BaseModel):
    variable_id: str
    region: RegionRef
    mode: Literal["outlook", "satellite"] = Field(
        "outlook", description="outlook: from today, driven by climate indices (up to ~18 months); satellite: from the last satellite month on the server (up to 12 months)")
    start: Optional[Month] = Field(None, description="First forecast month. Default: the current month (outlook) or the month after the data ends (satellite)")
    months: int = Field(13, ge=1, le=18, description="How many months to forecast, counting from `start`")


Confidence = Literal["high", "moderate", "low", "none"]


class ForecastPoint(BaseModel):
    t: Month
    lead_months: int = Field(description="Months between the last data used (origin) and this month")
    forecast: Optional[float]
    lower: Optional[float]
    upper: Optional[float]
    climatology: Optional[float]
    z_forecast: Optional[float]
    p_below: float = Field(description="Probability of a month below normal (lower third of 2001-2016 history for this calendar month)")
    p_near: float
    p_above: float = Field(description="Probability of a month above normal (upper third)")
    normal_range: tuple[Optional[float], Optional[float]] = Field(description="The 'normal' range (middle third), in the variable's units")
    signal: Literal["above", "below", "none"]
    confidence: Confidence = Field(description="How much the backtest supports this lead time in this latitude band")


class SkillRow(BaseModel):
    lead_months: int
    skill_vs_climatology: Optional[float] = Field(description="1 - MSE/MSE_climatology on unseen places and years; <= 0 means no better than the seasonal norm")
    skill_vs_persistence: Optional[float]
    rpss: Optional[float] = Field(description="Ranked probability skill score of the tercile probabilities against 1/3-1/3-1/3")
    tercile_accuracy: Optional[float]
    coverage_80: Optional[float]


class Analog(BaseModel):
    origin: Month
    target: Month
    distance: float
    z_outcome: float = Field(description="What really happened in that past year, in standard deviations from normal")
    state: dict[str, float]


class Condition(BaseModel):
    key: str
    label: str
    value: float
    unit: str
    as_of: Month
    phase: str
    description: str


class Contribution(BaseModel):
    group: str
    description: str
    effect_p_above: float = Field(description="Change in P(above normal) caused by this group of information, in probability points (0.05 = 5 points)")
    effect_p_below: float
    effect_z: float


class Explanation(BaseModel):
    month: Month
    headline: str
    simple: list[str]
    contributions: list[Contribution]
    conditions: list[Condition]
    scientific: dict[str, Any]


class DataStatus(BaseModel):
    today: Month
    satellite_data_end: Month
    indices_end: dict[str, Month]
    origin: Month
    mode: str
    note: str


class ForecastResponse(BaseModel):
    variable_id: str
    region: RegionOut
    units: str
    mode: str
    origin: Month
    interval: float
    points: list[ForecastPoint]
    backtest: list[SkillRow]
    drivers: dict[str, float]
    analogs: list[Analog]
    analog_horizon: int
    data_inputs: list[str]
    data_status: DataStatus
    explanation: Explanation
    method: str
    plain_summary: str
    source: DataSource
    warnings: list[str]


class ForecastMapCell(BaseModel):
    lat: float
    lon: float
    z_forecast: float
    signal: Literal["above", "below", "none"]
    p_below: float
    p_above: float


class ForecastMapResponse(BaseModel):
    variable_id: str
    mode: str
    origin: Month
    t: Month
    lead_months: int
    interval: float
    cells: list[ForecastMapCell]
    warnings: list[str]


class RealityRegion(BaseModel):
    months: list[Month]
    actual: list[Optional[float]]
    forecast: list[float]
    lower: list[float]
    upper: list[float]
    persistence: float
    baseline_period: str
    mae_model: float
    mae_climatology: float
    mae_persistence: float
    coverage_80: float
    n_months: int


class RealityCheckResponse(BaseModel):
    source: str
    origin: Month
    generated: str
    regions: dict[str, dict[str, RealityRegion]]
