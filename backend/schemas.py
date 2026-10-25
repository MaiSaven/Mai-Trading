from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime

class AccountSchema(BaseModel):
    account_id: int
    broker: str = "MetaQuotes-Demo"
    currency: str = "USD"
    balance: float = 0.0
    equity: float = 0.0
    margin: float = 0.0
    free_margin: float = 0.0
    leverage: int = 100
    profit: float = 0.0

class PositionSchema(BaseModel):
    ticket: int
    symbol: str
    type: str  # BUY or SELL
    volume: float
    price_open: float
    price_current: float
    sl: float = 0.0
    tp: float = 0.0
    profit: float = 0.0
    swap: float = 0.0
    time: int = 0

class PositionResponse(BaseModel):
    id: int
    ticket: int
    symbol: str
    type: str
    volume: float
    price_open: float
    price_current: float
    sl: float
    tp: float
    profit: float
    swap: float
    time: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
        orm_mode = True

class DealSchema(BaseModel):
    deal_id: int
    order_id: int = 0
    position_id: int
    symbol: str
    type: str  # BUY or SELL
    entry: str  # IN or OUT
    volume: float
    price: float
    profit: float = 0.0
    commission: float = 0.0
    swap: float = 0.0
    time: int

class SyncPayload(BaseModel):
    account: AccountSchema
    positions: List[PositionSchema] = []
    deals: List[DealSchema] = []

class JournalCreate(BaseModel):
    trade_id: int
    setup: str = ""
    emotion: str = ""
    notes: str = ""
    rating: int = 5
    screenshot_url: Optional[str] = None

class JournalResponse(BaseModel):
    id: int
    trade_id: int
    setup: str = ""
    emotion: str = ""
    notes: str = ""
    rating: int = 5
    screenshot_url: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
        orm_mode = True

class TradeResponse(BaseModel):
    id: int
    position_id: int
    symbol: str
    type: str
    volume: float
    entry_price: float
    exit_price: float
    open_time: datetime
    close_time: datetime
    gross_profit: float = 0.0
    commission: float = 0.0
    swap: float = 0.0
    net_pnl: float
    status: str = "CLOSED"
    journal_entry: Optional[JournalResponse] = None

    class Config:
        from_attributes = True
        orm_mode = True

class ManualTradeCreate(BaseModel):
    symbol: str
    type: str  # BUY or SELL
    volume: float = 0.1
    entry_price: float
    exit_price: float
    net_pnl: float
    setup: Optional[str] = ""
    emotion: Optional[str] = ""
    notes: Optional[str] = ""
    rating: Optional[int] = 5

class PnLPoint(BaseModel):
    trade_id: int
    time: str
    symbol: str
    net_pnl: float
    cumulative_pnl: float

class AnalyticsSummary(BaseModel):
    balance: float
    equity: float
    margin: float
    free_margin: float
    total_trades: int
    win_rate: float
    total_wins: int
    total_losses: int
    breakeven_trades: int
    total_net_pnl: float
    net_pnl: float  # Alias for backward compatibility
    gross_profit: float
    gross_loss: float
    profit_factor: float
    best_trade: float
    worst_trade: float
    avg_trade: float
    expectancy: float
    symbols_breakdown: Dict[str, Dict[str, Any]] = {}
    pnl_curve: List[PnLPoint] = []