"""Deterministic context transitions. Assistant history never creates measurements or tool outputs."""
import re
from pydantic import ValidationError

from . import agent, bridge, catalog, config, service
from .errors import ApiError
from .schemas import (ChatContext, ChatResponse, ChatWarning, ChatAction, ChatActionParams,
                      PresetRegion, TrendResponse, ToolResult)
from .tools import MAX_MONTHS, registry, PeriodInput, _region
from .llm import runtime


# Words that describe HOW to answer ("in the most understandable way", "in simple terms", "in Vietnamese"),
# so a phrase after "in" containing them is not an unknown place name.
_MANNER_WORDS = {
    "way", "ways", "words", "terms", "language", "detail", "details", "short", "brief", "summary", "simple",
    "simply", "plain", "easy", "easier", "understandable", "clear", "clearly", "layman", "laymans", "english",
    "vietnamese", "general", "nutshell", "sentence", "sentences", "paragraph", "points", "bullet", "steps",
    "kid", "child", "beginner", "beginners", "everyday", "non-technical", "nontechnical",
}


def _is_manner_phrase(phrase: str) -> bool:
    return any(word.strip("'") in _MANNER_WORDS for word in re.split(r"[\s_-]+", phrase.casefold()))


def prepare(req):
    text = req.message.casefold()
    ctx = req.context.model_copy(deep=True)
    # Methodology questions preserve selection and only use server evidence.
    methodology = re.search(r'method advisor|which method|why use.*mann|seasonal mann|autocorrelation|fdr|false discovery|confidence interval.*sen|caus|climate change caused', text)
    if methodology:
        if runtime.context_change(req):
            return ctx, None, 'This method question names another selection. Run that selection explicitly first; current analysis evidence is unchanged.'
        if _cached(ctx):
            ctx.intent = 'advisor'
            return ctx, 'advise_statistical_method', None
        if ctx.trend_id:
            return ctx, None, 'The referenced analysis is unavailable or does not match this selection. Run the selected trend first.'
        if re.search(r'which method|monthly rainfall|why use.*mann', text):
            return ctx, None, 'For monthly rainfall with relevant seasonal structure, consider Seasonal Mann-Kendall and seasonal Sen slope after reviewing completeness and serial dependence. This is conditional guidance; no analysis was performed. Select or run a trend for evidence-specific advice.'
        if re.search(r'caus', text):
            return ctx, None, 'A temporal trend cannot establish that climate change or another factor caused it. Causal attribution needs a separate study design; no causal analysis was performed.'
        if re.search(r'fdr|false discovery', text):
            return ctx, None, 'FDR correction addresses multiple testing across grid cells under its assumptions. The grid uses Benjamini-Hochberg on raw seasonal p-values, without serial-dependence correction. A regional p-value is not an FDR q-value. No grid test was performed for this question.'
        if 'autocorrelation' in text:
            return ctx, None, 'Autocorrelation is dependence across time that can affect trend inference. Select a computed analysis to inspect whether an adjusted p-value is available and which test determines its verdict. No new test was performed.'
        if re.search(r'interval', text):
            return ctx, None, 'The regional backend supplies an OLS anomaly confidence interval, not an interval for seasonal Sen slope. No interval was computed for this question.'
    before = ctx.model_dump(exclude={"trend_id", "intent"})
    reference_question = bool(ctx.trend_id and re.search(r"\bthat\b|\bhere\b|\bthis\b|result|p[- ]?value|significan|slope|interval|autocorrelation|fdr", text))
    concept = runtime.classify(req) == "education" and not reference_question
    # A selection that already names two regions stays a comparison even if the question says "trends"
    # (Phase 8.5 E2E: "Why might A and B show different temperature trends?" was answered for A only).
    two_places = ctx.intent == "compare" and ctx.region_b is not None
    intent = ("compare" if re.search(r"compar|so sánh", text) or (two_places and not re.search(
                  r"plot|time series|monthly observations|chuỗi|provenance|data source|dataset source|which dataset|nguồn", text)) else
              "series" if re.search(r"plot|time series|monthly observations|chuỗi", text) else
              "provenance" if re.search(r"provenance|data source|dataset source|which dataset|nguồn", text) else
              "trend" if re.search(r"trend|analy[sz]e|xu hướng", text) else ctx.intent or "trend")
    if reference_question and re.search(r"p[- ]?value|significan|method|slope|interval|autocorrelation|fdr", text):
        if ctx.intent == "compare":
            return ctx, None, "Do you mean a region's raw p-value, its adjusted p-value, or the between-region difference test?"
        intent = "trend"
    if re.search(r"forecast|predict|cause|causal|nguyên nhân|dự báo", text):
        return ctx, None, "Past trend tools cannot infer a cause or forecast. Ask about an observed trend or method."
    if concept:
        return ctx, "concept", None
    if re.search(r"wind speed", text):
        return ctx, None, "That variable is not supported by the current catalog. Ask for available variables."
    if re.search(r"list.*variables|available datasets", text):
        return ctx, "list_available_variables", None
    if re.search(r"list.*regions|available regions", text):
        return ctx, "list_available_regions", None
    literal_variable = re.search(r"\bvariable\s+([a-z][a-z0-9_]+)", text)
    if literal_variable and literal_variable[1] not in catalog.VARIABLES:
        raise ApiError(404, "NOT_FOUND", "Unknown variable. Inspect the available-variable catalog.")
    explicit = next((v.id for v in catalog.VARIABLES.values() if re.search(r"\b" + re.escape(v.id) + r"\b", text)), None)
    family = ("precipitation" if re.search(r"precipitation|rainfall|lượng mưa", text) else
              "root_zone_water" if re.search(r"root[- ]zone", text) else
              "ocean_chlorophyll" if re.search(r"chlorophyll|algae|ocean colou?r", text) else
              "soil_moisture" if re.search(r"soil moisture|ẩm đất", text) else
              "vegetation" if re.search(r"vegetation|greenness|ndvi|thảm thực vật", text) else
              "land_surface_temperature" if re.search(r"(land )?surface temperature|\blst\b|nhiệt độ bề mặt", text) else
              "air_temperature" if re.search(r"temperature|nhiệt độ", text) else
              "potential_evapotranspiration" if re.search(r"potential evapo|\bpet\b", text) else
              "evapotranspiration" if re.search(r"evapotranspiration|evaporation|bốc thoát hơi", text) else None)
    dataset_hint = ("M2IMNXASM" if re.search(r"merra[- ]?2|m2imnxasm", text) else
                    "GLDAS_NOAH025_M" if "gldas" in text else "GPM_3IMERGM" if "imerg" in text else
                    "MOD13C2" if re.search(r"modis.*(ndvi|vegetation)|(ndvi|vegetation).*modis", text) else
                    "SPL3SMP" if "smap" in text else "GPCC Full Data Monthly" if re.search(r"gpcc|rain gauge", text) else
                    "CRU TS" if re.search(r"\bcru\b", text) else None)
    if dataset_hint and family is None:
        family = ({"SPL3SMP": "soil_moisture", "GPCC Full Data Monthly": "precipitation", "CRU TS": "precipitation"}
                  .get(dataset_hint) or ctx.parameter or ("air_temperature" if dataset_hint == "M2IMNXASM" else None))
    candidates = [v for v in catalog.VARIABLES.values() if (not family or catalog.VARIABLE_PARAMETER[v.id][0] == family)
                  and (not dataset_hint or v.product == dataset_hint)]
    depth = re.search(r"\b(\d+)\s*(?:-|–|to)\s*(\d+)\s*cm\b", text)
    if depth:
        candidates = [v for v in candidates if v.id.endswith(f"_{depth[1]}_{depth[2]}cm")] or candidates
    # Several datasets left, no depth named, current selection not among them: the default keeps the old answer
    # ("soil moisture" / "GLDAS soil moisture" → 0–10 cm, "precipitation" → IMERG).
    default = catalog.DEFAULT_VARIABLE.get(family)
    if len(candidates) > 1 and not depth and any(v.id == default for v in candidates) \
            and not any(v.id == ctx.variable_id for v in candidates):
        candidates = [catalog.VARIABLES[default]]
    pending_clarification = None
    if explicit:
        if dataset_hint and catalog.VARIABLES[explicit].product != dataset_hint:
            raise ApiError(422, "UNSUPPORTED_DATASET", "The named variable and dataset do not match.")
        ctx.variable_id = explicit
        ctx.dataset_id = catalog.VARIABLES[explicit].product
    elif family or dataset_hint:
        compatible = next((v for v in candidates if v.id == ctx.variable_id), None)
        if compatible:
            ctx.dataset_id = compatible.product
        elif len(candidates) == 1:
            ctx.variable_id, ctx.dataset_id = candidates[0].id, candidates[0].product
        else:
            ctx.parameter, ctx.variable_id, ctx.dataset_id, ctx.trend_id, ctx.intent = family, None, None, None, "trend"
            pending_clarification = "Choose a compatible dataset explicitly, for example MERRA-2 or GLDAS air temperature."
    found = []
    for region in catalog.REGIONS.values():
        aliases = [region.id, region.id.replace("_", " "), region.name.casefold().split(",")[0]]
        positions = [m.start() for alias in aliases for m in re.finditer(r"\b" + re.escape(alias) + r"\b", text)]
        if positions:
            found.append((min(positions), region.id))
    ids = [identifier for _, identifier in sorted(found)]
    if intent == "compare":
        if len(ids) >= 2:
            ctx.region, ctx.region_b = PresetRegion(type="preset", id=ids[0]), PresetRegion(type="preset", id=ids[1])
        elif len(ids) == 1:
            if ctx.region:
                ctx.region_b = PresetRegion(type="preset", id=ids[0])
            else:
                ctx.region = PresetRegion(type="preset", id=ids[0])
        if "another region" in text and not ids:
            ctx.region_b = None
    elif ids:
        ctx.region = PresetRegion(type="preset", id=ids[0])
    if not ids:
        named = re.search(r"\b(?:in|with|region)\s+([a-z][a-z _-]*?)(?=\s+(?:from|between|during)\b|[?.!,]|$)", text)
        if named and not named[1].startswith(("this", "that", "the current", "another", "the selected", "detail", "plain", "english")) \
                and not _is_manner_phrase(named[1]):
            raise ApiError(404, "NOT_FOUND", "Unknown region. Choose a catalog preset or a validated bounding box.")
    months = re.findall(r"\b(?:19|20)\d{2}-\d{2}\b", text)
    years = re.findall(r"\b(?:19|20)\d{2}\b", text)
    if months:
        if len(months) != 2:
            return ctx, None, "Supply both start and end months as YYYY-MM."
        ctx.start, ctx.end = months
    elif years:
        if len(years) > 2:
            return ctx, None, "Choose one unambiguous start and end year."
        ctx.start, ctx.end = years[0] + "-01", years[-1] + "-12"
    # Revalidate model_copy changes; no history value is used for context resolution.
    try:
        ctx = ChatContext.model_validate(ctx.model_dump())
    except ValidationError:
        raise ApiError(422, "VALIDATION_ERROR", "Use valid YYYY-MM start and end dates.") from None
    if ctx.variable_id:
        v = service.get_variable(ctx.variable_id)
        if ctx.dataset_id and ctx.dataset_id != v.product:
            raise ApiError(422, "UNSUPPORTED_DATASET", "Dataset and variable do not match.")
        ctx.dataset_id = v.product
        ctx.parameter = catalog.VARIABLE_PARAMETER[v.id][0]
        cov = bridge.coverage(v.pipeline_id)
        if cov and ctx.start and ctx.end and not (months or years):   # period carried over from the page: fit this dataset
            ctx.start, ctx.end = max(ctx.start, cov[0]), min(ctx.end, cov[1])
            if ctx.start > ctx.end:
                return ctx, None, f"This dataset covers {cov[0]} to {cov[1]}. Choose a period inside it."
    for region in [ctx.region, ctx.region_b]:
        if region:
            service.resolve_region(region)
            if region.type == "geojson":
                return ctx, None, "Select a preset, bounding box or country for conversational tools."
    ctx.intent = intent
    if before != ctx.model_dump(exclude={"trend_id", "intent"}):
        ctx.trend_id = None
    if pending_clarification:
        return ctx, None, pending_clarification
    if not ctx.variable_id:
        return ctx, None, "Which variable and dataset should be analysed? Ask for available variables."
    if intent != "provenance" and not all([ctx.region, ctx.start, ctx.end]):
        return ctx, None, "Choose a region and both start and end dates for the analysis."
    if intent == "compare" and not ctx.region_b:
        return ctx, None, "Which second region should be compared? Choose a catalog region such as Hanoi or Mekong Delta."
    if intent != "provenance":
        try:
            PeriodInput.model_validate({"variable_id": ctx.variable_id, "dataset_id": ctx.dataset_id, "start": ctx.start, "end": ctx.end})
        except ValidationError:
            raise ApiError(400, "INVALID_TIME_RANGE", f"Choose an ordered period of at most {MAX_MONTHS} months (2001 to 2026).") from None
        service._check_time(v, ctx.start, ctx.end)
        for region in [ctx.region, ctx.region_b if intent == "compare" else None]:
            if region:
                try:
                    _region(region, v)
                except ApiError as error:
                    if error.code == "RESOURCE_LIMIT":
                        return ctx, None, "Select a smaller region for conversational analysis (at most 1000 square degrees, for example 30° × 30°)."
                    raise
    return ctx, {"trend": "analyze_trend", "compare": "compare_regions", "series": "get_time_series", "provenance": "get_dataset_provenance"}[intent], None


def _cached(ctx):
    t = service.stored_trend(ctx.trend_id) if ctx.trend_id else None
    if not t:
        return None
    if ctx.dataset_id and ctx.variable_id in catalog.VARIABLES and ctx.dataset_id != catalog.VARIABLES[ctx.variable_id].product:
        return None
    if t["variable_id"] != ctx.variable_id or (t["start"], t["end"]) != (ctx.start, ctx.end):
        return None
    region = service.resolve_region(ctx.region)[0] if ctx.region else None
    return t if region and region["bbox"] == t["region"]["bbox"] else None


def decorate(response, ctx):
    if response.evidence:
        # The first region remains the comparison's primary context.
        ctx = ctx.model_copy(update={"trend_id": response.evidence[0].trend.trend_id})
    response = response.model_copy(update={"resolved_context": ctx, "suggested_questions": [
        "What does that p-value mean?", "Compare it with another region.", "Plot the time series.", "Inspect dataset provenance."]})
    actions = []
    if ctx.variable_id and ctx.region and ctx.region.type in {"preset", "bbox", "country"} and ctx.start and ctx.end:
        if ctx.start.endswith("-01") and ctx.end.endswith("-12"):
            params = ChatActionParams(variable_id=ctx.variable_id, region=ctx.region, start=ctx.start, end=ctx.end,
                                      region_b=ctx.region_b if ctx.region_b and ctx.region_b.type in {"preset", "bbox", "country"} else None)
            if response.evidence:
                actions += [ChatAction(type="navigate", page=page, label=label, params=params) for page, label in [
                    ("explore", "Open this analysis in Explore"), ("report", "Add this analysis to Report")]]
            if ctx.region_b and ctx.region.type == ctx.region_b.type == "preset":
                actions.append(ChatAction(type="navigate", page="hunt", label="Open these regions in Hunt", params=params))
        else:
            response = response.model_copy(update={"warnings": [*response.warnings, ChatWarning(code="ANALYSIS_WARNING",
                message="This month-specific period stays in Detective; other analysis pages currently select whole years.")]})
    return response.model_copy(update={"actions": actions})


def respond(req, template, identifier=None):
    ctx, operation, clarification = prepare(req)
    normalized = req.model_copy(update={"context": ctx})
    if clarification:
        return decorate(ChatResponse(answer=clarification, clarification=clarification, mode="template", evidence=[], actions=[],
                        warnings=[], disclaimer="No new statistical conclusion was generated."), ctx)
    cached = _cached(ctx)
    if cached and operation == "analyze_trend" and re.search(r"p[- ]?value|significan|method|that|explain|slope|interval|autocorrelation|fdr", req.message, re.I):
        result = ToolResult(tool="analyze_trend", ok=True, data=TrendResponse.model_validate(cached))
        detail = statistical_followup(req.message, result.data)
        response = agent.explain_results(normalized, [result], detail, identifier)
        return decorate(response, ctx)
    if operation == "concept":
        return decorate(runtime.enhance(normalized, template, request_id=identifier), ctx)
    if operation == 'advise_statistical_method':
        settings = config.llm_settings()
        if settings.provider == 'gemini' and settings.api_key:
            response = agent.run(normalized, template, identifier)
        else:
            result = registry.execute(operation, {'analysis_id': ctx.trend_id})
            response = agent.response_from_results([result], ctx)
        cached = _cached(ctx)
        if cached:
            response = response.model_copy(update={'answer': response.answer + ' ' + statistical_followup(req.message, TrendResponse.model_validate(cached))})
        return decorate(response, ctx)
    settings = config.llm_settings()
    if operation == "compare_regions" and ctx.region is not None and ctx.region_b is not None:
        # Phase 8.5 E2E: the model sometimes analysed only region A for a two-region question. When the selection
        # already says "compare", the backend runs the comparison itself and the model only explains the verified result.
        result = registry.execute("compare_regions", {
            "variable_id": ctx.variable_id, "dataset_id": ctx.dataset_id, "start": ctx.start, "end": ctx.end,
            "region_a": ctx.region.model_dump(mode="json", exclude_none=True),
            "region_b": ctx.region_b.model_dump(mode="json", exclude_none=True)})
        if result.ok:
            detail = ("Different trends in two places show what changed, not why; possible reasons are hypotheses "
                      "that need separate evidence.")
            return decorate(agent.explain_results(normalized, [result], detail, identifier), ctx)
    if settings.provider == "gemini" and settings.api_key:
        return decorate(agent.run(normalized, template, identifier), ctx)
    args = {}
    if operation not in {"list_available_variables", "list_available_regions"}:
        args = {"variable_id": ctx.variable_id, "dataset_id": ctx.dataset_id}
        if operation != "get_dataset_provenance":
            args.update(start=ctx.start, end=ctx.end)
            if operation == "compare_regions":
                args.update(region_a=ctx.region.model_dump(mode="json", exclude_none=True), region_b=ctx.region_b.model_dump(mode="json", exclude_none=True))
            else:
                args["region"] = ctx.region.model_dump(mode="json", exclude_none=True)
    result = registry.execute(operation, args)
    return decorate(agent.response_from_results([result], ctx), ctx)


def statistical_followup(message, t):
    from .chat import FAQ
    text = message.casefold()
    if re.search(r'caus', text):
        return 'A temporal trend cannot establish that climate change caused it. Causal attribution requires separate evidence and study design; no causal test was performed.'
    if re.search(r'which method|why use|mann.?kendall|method advisor', text):
        return 'Seasonal Mann-Kendall compares matching calendar months for a monotonic trend. Monthly cadence motivates considering seasonal stratification, but does not establish seasonality or independence. Seasonal Sen slope estimates magnitude separately from significance.'
    if re.search(r"fdr|false discovery", text):
        return "Regional trend evidence has no FDR q-value. FDR addresses multiple grid-cell tests under its assumptions. The grid uses BH correction on raw seasonal p-values without serial-dependence correction; FDR does not fix those assumptions. A regional raw or autocorrelation-adjusted p-value is not an FDR q-value."
    if re.search(r"autocorrelation|adjusted", text):
        return (f"Raw seasonal p-value: {t.p_value}; autocorrelation-adjusted p-value: {t.p_value_autocorr_adjusted}. "
                "These are separate tests; the reported significance decision uses the raw seasonal test, not the adjusted value. " + FAQ["what is autocorrelation"])
    if re.search(r"p[- ]?value", text):
        if t.p_value is None:
            return "This analysis has no valid p-value. " + FAQ["what is a p-value"]
        decision = "rejects" if t.significant is True else "does not reject" if t.significant is False else "cannot decide whether to reject"
        return (f"The raw seasonal p-value is {t.p_value:.6g} (about {100*t.p_value:.3g}%). Under the no-trend null hypothesis and the reported test assumptions, "
                "a statistic at least this extreme has that probability. "
                f"At alpha = {t.alpha}, the reported test {decision} the no-trend null hypothesis. "
                "This does not prove that no trend exists. " + FAQ["what is a p-value"])
    if re.search(r"interval", text):
        return FAQ["what is a confidence interval"]
    if re.search(r"slope", text):
        return FAQ["what is sen's slope"] + " The slope estimates direction and size; significance also depends on variability and available evidence. A positive slope alone does not establish a statistically significant increase."
    return "The reported significance decision uses the raw seasonal p-value and the selected alpha. Failure to detect significance does not prove the absence of a trend."
