from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field


GroupSize = Literal["small", "medium", "large"]
Intensity = Literal["low", "med", "high"]
EventType = Literal["shown", "clicked", "accepted", "declined", "attended"]


class User(BaseModel):
    id: str
    interest_tags: List[str] = Field(default_factory=list)
    lat: float
    lng: float
    max_travel_mins: int
    availability: List[str] = Field(default_factory=list)
    group_pref: GroupSize
    intensity_pref: Intensity
    goal: Optional[Literal["friends", "active", "volunteer", "learn"]] = None
    cohort: Optional[str] = None


class Opportunity(BaseModel):
    id: str
    title: str
    tags: List[str] = Field(default_factory=list)
    category: str
    time_bucket: str
    lat: float
    lng: float
    capacity: int
    group_size: GroupSize
    intensity: Intensity
    beginner_friendly: bool = True


class Interaction(BaseModel):
    user_id: str
    opp_id: str
    event: EventType
    ts: datetime


class SeedRequest(BaseModel):
    mode: Literal["fixture", "synthetic"]
    num_users: Optional[int] = None
    num_opps: Optional[int] = None
    fixture_path: Optional[str] = "data/seed/demo_small.json"


class PricingParams(BaseModel):
    eta: Optional[float] = None
    rho: Optional[float] = None
    p_min: Optional[float] = None
    p_max: Optional[float] = None
    lambda_price: Optional[float] = None


class SolveRequest(BaseModel):
    weights: Optional[Dict[str, float]] = None
    pricing: Optional[PricingParams] = None
    user_ids: Optional[List[str]] = None
    return_top_k_alternatives: int = 3
    enable_fairness_boost: bool = False
    lambda_fair: Optional[float] = None


class FeedbackRequest(BaseModel):
    user_id: str
    opp_id: str
    event: EventType


class Assignment(BaseModel):
    user_id: str
    opp_id: str


class Recommendation(BaseModel):
    primary: Optional[str] = None
    alternatives: List[str] = Field(default_factory=list)


class ScoreExplanation(BaseModel):
    score: float
    breakdown: Dict[str, float]
    reason_chips: List[str] = Field(default_factory=list)


class OppFill(BaseModel):
    opp_id: str
    fill: float
    price: float


class MetricsResult(BaseModel):
    utilization: float
    avg_fill_ratio: float
    fairness_gap: float
    top_overdemanded: List[OppFill] = Field(default_factory=list)
    top_underfilled: List[OppFill] = Field(default_factory=list)
    gini_exposure: Optional[float] = None
    avg_diversity: Optional[float] = None


class SolveResponse(BaseModel):
    assignments: List[Assignment]
    unassigned_user_ids: List[str]
    recommendations: Dict[str, Recommendation]
    explanations: Dict[str, ScoreExplanation]
    prices: Dict[str, float]
    metrics: MetricsResult


class SeedResponse(BaseModel):
    num_users: int
    num_opps: int
    prices: Dict[str, float]


class FeedbackResponse(BaseModel):
    opp_id: str
    demand: int
    shown: int
    total_interactions: int


class RebalanceResponse(SolveResponse):
    price_deltas: Dict[str, float]


class MetricsResponse(BaseModel):
    metrics: MetricsResult
    prices: Dict[str, float]
    demand_by_opp: Dict[str, int]
    shown_by_opp: Dict[str, int]
