from sqlalchemy import Column, Integer, String, Float, DateTime, Text, ForeignKey, BigInteger, Index
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    google_id = Column(String, unique=True, index=True, nullable=True)
    email = Column(String, unique=True, index=True)
    name = Column(String, nullable=True)
    picture = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime, default=datetime.utcnow)

    accounts = relationship("Account", back_populates="user")

class Broker(Base):
    __tablename__ = "brokers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    server = Column(String, default="", index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(BigInteger, unique=True, index=True)
    login = Column(BigInteger, nullable=True, index=True)
    server = Column(String, default="")
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    broker = Column(String, default="Unknown Broker")
    currency = Column(String, default="USD")
    balance = Column(Float, default=0.0)
    equity = Column(Float, default=0.0)
    margin = Column(Float, default=0.0)
    free_margin = Column(Float, default=0.0)
    leverage = Column(Integer, default=100)
    profit = Column(Float, default=0.0)
    updated_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="accounts")
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
    close_time = Column(DateTime, default=datetime.utcnow, index=True)
    gross_profit = Column(Float, default=0.0)
    commission = Column(Float, default=0.0)
    swap = Column(Float, default=0.0)
    net_pnl = Column(Float, default=0.0)
    status = Column(String, default="CLOSED")

    account = relationship("Account", back_populates="trades")
    journal_entry = relationship("JournalEntry", back_populates="trade", uselist=False, cascade="all, delete-orphan", lazy="joined")

    # Composite indexes for the most common query patterns
    __table_args__ = (
        Index("ix_trades_account_close", "account_id", "close_time"),
        Index("ix_trades_account_pnl",   "account_id", "net_pnl"),
    )


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
