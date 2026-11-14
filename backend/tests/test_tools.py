import json

import pytest

from app import tools, service
from app.schemas import TrendRequest

ARGS = {"variable_id": "imerg_precip", "dataset_id": "GPM_3IMERGM", "region": {"type": "preset", "id": "mekong_delta"},
        "start": "2001-01", "end": "2020-12"}


def test_six_tools_and_typed_catalogs(client):
    assert len(tools.registry.list_tools()) == 7
    for tool in tools.registry.list_tools():
        assert tool["purpose"] and tool["input_schema"] and tool["output_schema"]
    vs = tools.registry.execute("list_available_variables", {})
    assert vs.ok and vs.data.variables[0].source.product and vs.provenance
    rs = tools.registry.execute("list_available_regions", {})
    assert rs.ok and rs.data.supported_selection_types == ["preset", "bbox"]
    assert "mekong_delta" in [r.id for r in rs.data.catalog.regions]


def test_exact_existing_trend_and_series(client):
    expected = service.trends(TrendRequest.model_validate({k: v for k, v in ARGS.items() if k != "dataset_id"}))
    result = tools.registry.execute("analyze_trend", ARGS)
    assert result.ok and result.data.model_dump(mode="json") == json.loads(json.dumps(expected))
    series = tools.registry.execute("get_time_series", ARGS)
    assert series.ok and len(series.data.points) == 240 and series.data.quality.sufficient
    p = tools.registry.execute("get_dataset_provenance", {"variable_id": "imerg_precip"})
    assert p.ok and p.data.variable.source.product == "GPM_3IMERGM" and p.data.processing_notes


def test_real_comparison_delegation(client):
    args = {k: v for k, v in ARGS.items() if k != "region"}
    args.update(region_a={"type": "bbox", "bbox": [100., 5., 104., 10.]}, region_b={"type": "bbox", "bbox": [106., 5., 110., 10.]})
    result = tools.registry.execute("compare_regions", args)
    assert result.ok and result.data.difference.test == "mk_sen_on_anomaly_difference_block_bootstrap_ci"
    assert result.data.difference.significant and result.data.is_contradiction


@pytest.mark.parametrize("patch,category", [
    ({"variable_id": "unknown"}, "invalid_input"),
    ({"dataset_id": "GLDAS_NOAH025_M"}, "unsupported_dataset"),
    ({"region": {"type": "preset", "id": "invented"}}, "unknown_region"),
    ({"region": {"type": "bbox", "bbox": [180., 0., -180., 5.]}}, "invalid_input"),
    ({"region": {"type": "preset", "id": "global"}}, "resource_limit"),
    ({"start": "1990-01"}, "invalid_input"),
    ({"start": "2020-13"}, "invalid_input"),
    ({"end": "1999-01"}, "invalid_input"),
    ({"path": "C:/secret"}, "invalid_input"),
    ({"url": "https://example.com"}, "invalid_input"),
    ({"variable_id": "merra2_air_temperature_2m", "dataset_id": "M2IMNXASM"}, "service_unavailable"),
])
def test_invalid_and_bounded_arguments(client, patch, category):
    result = tools.registry.execute("analyze_trend", {**ARGS, **patch})
    assert not result.ok and result.error.category == category and result.data is None


def test_no_observations_and_unknown_tool(client):
    args = {**ARGS, "variable_id": "gldas_soil_moisture_0_10cm", "dataset_id": "GLDAS_NOAH025_M",
            "region": {"type": "bbox", "bbox": [108., 5., 110., 10.]}}
    assert tools.registry.execute("analyze_trend", args).error.category == "no_observations"
    assert tools.registry.execute("__import__", {"code": "malicious"}).error.category == "unknown_tool"


def test_serialization_limit_and_compute_failure(client, monkeypatch):
    monkeypatch.setattr(tools, "MAX_RESULT_BYTES", 30)
    assert tools.registry.execute("analyze_trend", ARGS).error.category == "resource_limit"
    monkeypatch.setattr(service, "trends", lambda _: (_ for _ in ()).throw(RuntimeError("private")))
    result = tools.registry.execute("analyze_trend", ARGS)
    assert result.error.category == "computation_failed" and "private" not in result.model_dump_json()


def test_single_computation_budget(client):
    assert tools._computation.acquire(False)
    try:
        assert tools.registry.execute("analyze_trend", ARGS).error.category == "resource_limit"
    finally:
        tools._computation.release()
