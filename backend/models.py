from sqlalchemy import Column, Integer, String, Float, DateTime, Text, ForeignKey, BigInteger
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base

class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(BigInteger, unique=True, index=True)
    broker = Column(String, default="Unknown Broker")
    currency = Column(String, default="USD")
    balance = Column(Float, default=0.0)
    equity = Column(Float, default=0.0)
    margin = Column(Float, default=0.0)
    free_margin = Column(Float, default=0.0)
    leverage = Column(Integer, default=100)
    profit = Column(Float, default=0.0)
    updated_at = Column(DateTime, default=datetime.utcnow)

    positions = relationship("Position", back_populates="account", cascade="all, delete-orphan")
    deals = relationship("Deal", back_populates="account", cascade="all, delete-orphan")
    trades = relationship("Trade", back_populates="account", cascade="all, delete-orphan")


class Position(Base):
    __tablename__ = "positions"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(BigInteger, ForeignKey("accounts.account_id", ondelete="CASCADE"), nullable=True, index=True)
    ticket = Column(BigInteger, unique=True, index=True)
    symbol = Column(String, index=True)
    type = Column(String)
    volume = Column(Float, default=0.0)
    price_open = Column(Float, default=0.0)
    price_current = Column(Float, default=0.0)
    sl = Column(Float, default=0.0)
    tp = Column(Float, default=0.0)
    profit = Column(Float, default=0.0)
    swap = Column(Float, default=0.0)
    time = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)

    account = relationship("Account", back_populates="positions")


class Deal(Base):
    __tablename__ = "deals"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(BigInteger, ForeignKey("accounts.account_id", ondelete="CASCADE"), nullable=True, index=True)
    deal_id = Column(BigInteger, unique=True, index=True)
    order_id = Column(BigInteger, default=0)
    position_id = Column(BigInteger, index=True)
    symbol = Column(String, index=True)
    type = Column(String)
    entry = Column(String)
    volume = Column(Float, default=0.0)
    price = Column(Float, default=0.0)
    profit = Column(Float, default=0.0)
    commission = Column(Float, default=0.0)
    swap = Column(Float, default=0.0)
    timestamp = Column(DateTime, default=datetime.utcnow)

    account = relationship("Account", back_populates="deals")


class Trade(Base):
    __tablename__ = "trades"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(BigInteger, ForeignKey("accounts.account_id", ondelete="CASCADE"), nullable=True, index=True)
    position_id = Column(BigInteger, unique=True, index=True)
    symbol = Column(String, index=True)
    type = Column(String)
    volume = Column(Float, default=0.0)
    entry_price = Column(Float, default=0.0)
    exit_price = Column(Float, default=0.0)
    open_time = Column(DateTime, default=datetime.utcnow)
    close_time = Column(DateTime, default=datetime.utcnow)
    gross_profit = Column(Float, default=0.0)
    commission = Column(Float, default=0.0)
    swap = Column(Float, default=0.0)
    net_pnl = Column(Float, default=0.0)
    status = Column(String, default="CLOSED")

    account = relationship("Account", back_populates="trades")
    journal_entry = relationship("JournalEntry", back_populates="trade", uselist=False, cascade="all, delete-orphan")


class JournalEntry(Base):
    __tablename__ = "journal_entries"

    id = Column(Integer, primary_key=True, index=True)
    trade_id = Column(Integer, ForeignKey("trades.id", ondelete="CASCADE"), unique=True)
    setup = Column(String, default="")
    emotion = Column(String, default="")
    notes = Column(Text, default="")
    rating = Column(Integer, default=5)
    screenshot_url = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    trade = relationship("Trade", back_populates="journal_entry")
