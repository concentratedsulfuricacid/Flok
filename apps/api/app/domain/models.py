from __future__ import annotations

"""Pydantic models for the Flok API domain and request/response payloads."""

from datetime import datetime
from typing import Dict, List, Literal, Optional, Tuple
from pydantic import AliasChoices, BaseModel, ConfigDict, Field


GroupSize = Literal["small", "medium", "large"]
Intensity = Literal["low", "med", "high"]
EventType = Literal["shown", "clicked", "accepted", "declined", "attended"]


class User(BaseModel):
    """A user with preferences, constraints, and optional cohort for fairness."""

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
    """An event/opportunity that users can be matched to."""

    id: str
    title: str
    description: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    category: str
    time_bucket: str
    time: Optional[str] = None
    lat: float
    lng: float
    capacity: int
    min_attendees: Optional[int] = None
    group_size: GroupSize
    intensity: Intensity
    beginner_friendly: bool = True
    image_url: Optional[str] = None


class Interaction(BaseModel):
    """A user interaction event with an opportunity."""

    user_id: str
    opp_id: str
    event: EventType
    ts: datetime


class SeedRequest(BaseModel):
    """Request payload to seed data from a fixture or generate synthetic data."""

    mode: Literal["fixture", "synthetic"]
    num_users: Optional[int] = None
    num_opps: Optional[int] = None
    fixture_path: Optional[str] = "data/seed/demo_small.json"


class PricingParams(BaseModel):
    """Optional pricing parameter overrides for a solve/rebalance run."""

    eta: Optional[float] = None
    rho: Optional[float] = None
    p_min: Optional[float] = None
    p_max: Optional[float] = None
    lambda_price: Optional[float] = None
    liquidity_k: Optional[float] = None


class SolveRequest(BaseModel):
    """Request payload to solve assignments with optional overrides."""

    weights: Optional[Dict[str, float]] = None
    pricing: Optional[PricingParams] = None
    user_ids: Optional[List[str]] = None
    return_top_k_alternatives: int = 3
    enable_fairness_boost: bool = False
    lambda_fair: Optional[float] = None


class FeedbackRequest(BaseModel):
    """Record a user interaction with an opportunity."""

    model_config = ConfigDict(populate_by_name=True)

    user_id: str
    opp_id: str = Field(alias="event_id")
    event: EventType = Field(alias="type")


class Assignment(BaseModel):
    """A single user-to-opportunity assignment."""

    user_id: str
    opp_id: str


class Recommendation(BaseModel):
    """Primary and alternative recommendations for a user."""

    primary: Optional[str] = None
    alternatives: List[str] = Field(default_factory=list)


class ScoreExplanation(BaseModel):
    """Explain a score with breakdown and human-readable reason chips."""

    score: float
    breakdown: Dict[str, float]
    reason_chips: List[str] = Field(default_factory=list)


class OppFill(BaseModel):
    """Opportunity fill summary used in metrics dashboards."""

    opp_id: str
    fill: float
    price: float


class MetricsResult(BaseModel):
    """Aggregated metrics for dashboard display."""

    utilization: float
    avg_fill_ratio: float
    fairness_gap: float
    top_overdemanded: List[OppFill] = Field(default_factory=list)
    top_underfilled: List[OppFill] = Field(default_factory=list)
    gini_exposure: Optional[float] = None
    avg_diversity: Optional[float] = None


class SolveResponse(BaseModel):
    """Response payload for /solve and /rebalance endpoints."""

    assignments: List[Assignment]
    unassigned_user_ids: List[str]
    recommendations: Dict[str, Recommendation]
    explanations: Dict[str, ScoreExplanation]
    prices: Dict[str, float]
    metrics: MetricsResult


class SeedResponse(BaseModel):
    """Response payload for /seed endpoint."""

    num_users: int
    num_opps: int
    prices: Dict[str, float]


class FeedbackResponse(BaseModel):
    """Response payload for /feedback endpoint."""

    opp_id: str
    demand: float
    shown: int
    total_interactions: int


class UserUpsertRequest(BaseModel):
    """Create or update a user profile."""

    model_config = ConfigDict(populate_by_name=True)

    user_id: Optional[str] = None
    interest_tags: List[str] = Field(
        default_factory=list, validation_alias=AliasChoices("interests", "tags")
    )
    lat: float = 0.0
    lng: float = 0.0
    max_travel_mins: int = 30
    availability: List[str] = Field(default_factory=list)
    group_pref: GroupSize = "medium"
    intensity_pref: Intensity = "med"
    goal: Optional[Literal["friends", "active", "volunteer", "learn"]] = None
    cohort: Optional[str] = None


class UserUpsertResponse(BaseModel):
    """Response payload for /users."""

    user_id: str


class FeedItem(BaseModel):
    """A ranked event in the personalized feed."""

    event_id: str
    title: str
    category: str
    time_bucket: str
    tags: List[str]
    lat: float
    lng: float
    capacity: int
    group_size: GroupSize
    intensity: Intensity
    beginner_friendly: bool
    fit_score: float
    pulse: float
    availability_ok: bool
    reasons: List[str] = Field(default_factory=list)


class FeedResponse(BaseModel):
    """Response payload for /feed."""

    user_id: str
    items: List[FeedItem]


class EventCreateRequest(BaseModel):
    """Create a new event/opportunity."""

    title: str
    description: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    category: str = "community"
    time_bucket: str = "weeknights"
    time: Optional[str] = None
    lat: float = 0.0
    lng: float = 0.0
    capacity: int = 10
    min_attendees: Optional[int] = None
    group_size: GroupSize = "medium"
    intensity: Intensity = "med"
    beginner_friendly: bool = True


class EventUpdateRequest(BaseModel):
    """Update an event's mutable fields."""

    title: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    category: Optional[str] = None
    time_bucket: Optional[str] = None
    time: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    capacity: Optional[int] = None
    min_attendees: Optional[int] = None
    group_size: Optional[GroupSize] = None
    intensity: Optional[Intensity] = None
    beginner_friendly: Optional[bool] = None


class EventDetailResponse(BaseModel):
    """Response payload for event detail."""

    event: Opportunity
    pulse: float
    spots_left: int
    pulse_history: Optional[List[Tuple[str, float]]] = None


class EventCreateResponse(BaseModel):
    """Response payload for event creation."""

    event_id: str


class EventUpdateResponse(BaseModel):
    """Response payload for event updates."""

    event_id: str


class RSVPRequest(BaseModel):
    """Request payload for RSVP."""

    user_id: str


class RSVPResponse(BaseModel):
    """Response payload for RSVP."""

    event_id: str
    status: Literal["CONFIRMED", "FULL", "WAITLISTED"]
    spots_left: int


class ExplanationResponse(BaseModel):
    """Response payload for explain endpoint."""

    event_id: str
    user_id: str
    score: float
    breakdown: Dict[str, float]
    reasons: List[str] = Field(default_factory=list)


class TrendingItem(BaseModel):
    """Trending event info."""

    event_id: str
    title: str
    pulse: float
    pulse_delta: float


class TrendingResponse(BaseModel):
    """Response payload for /trending."""

    items: List[TrendingItem]


class DemoSimulateRequest(BaseModel):
    """Request payload for demo simulation."""

    hot_event_id: Optional[str] = None
    num_users: int = 10
    accept_rate: float = 0.6
    click_rate: float = 0.8


class DemoSimulateResponse(BaseModel):
    """Response payload for demo simulation."""

    event_id: str
    before_pulse: float
    after_pulse: float
    before_fill: float
    after_fill: float
    movers: List[TrendingItem] = Field(default_factory=list)


class RebalanceResponse(SolveResponse):
    """Solve response with price deltas after a rebalance."""

    price_deltas: Dict[str, float]
    summary: Optional["RebalanceSummary"] = None


class RebalanceSummary(BaseModel):
    """Summary payload for rebalance."""

    assigned_count: int
    unassigned_count: int
    top_pulse_movers: List[TrendingItem] = Field(default_factory=list)


class MetricsResponse(BaseModel):
    """Response payload for /metrics endpoint."""

    metrics: MetricsResult
    prices: Dict[str, float]
    demand_by_opp: Dict[str, float]
    shown_by_opp: Dict[str, int]
