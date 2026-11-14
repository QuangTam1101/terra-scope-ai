"""Small provider boundary, independent of the FastAPI response contract."""
from dataclasses import dataclass
from typing import Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field

ErrorCode = Literal["config", "missing_key", "auth", "rate_limit", "timeout", "model_unavailable",
                    "service", "network", "invalid_request", "invalid_response", "grounding", "agent_limit"]


class ProviderError(Exception):
    def __init__(self, code: ErrorCode, *, http_status: int | None = None, detail: str | None = None):
        self.code = code
        self.http_status = http_status
        self.detail = detail
        super().__init__(code)  # Never retain SDK messages, URLs or credentials.


@dataclass(frozen=True)
class GenerationInput:
    kind: Literal["education", "data"]
    message: str
    history: tuple[dict[str, str], ...]
    evidence: dict | None
    approved_statements: dict[str, str]
    request_id: str = ""
    audience: str | None = None  # "explorer" | "scientist" | None: wording only


class ProviderReply(BaseModel):
    model_config = ConfigDict(extra="forbid")

    answer: str = Field(max_length=4000, description="Educational prose only. Empty for data questions.")
    statement_ids: list[str] = Field(max_length=4, description="For data: choose only approved statement IDs.")


class LLMProvider(Protocol):
    async def generate(self, request: GenerationInput) -> ProviderReply: ...
