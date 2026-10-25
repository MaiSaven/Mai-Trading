import React, { useState, useEffect } from "react";

export default function TradingJournal() {
    const [summary, setSummary] = useState(null);
    const [trades, setTrades] = useState([]);
    const [selectedTrade, setSelectedTrade] = useState(null);
    const [notes, setNotes] = useState({ setup: "", emotion: "", notes: "", rating: 5 });

    const API_BASE = "http://localhost:8000/api/v1";

    const fetchData = async () => {
        try {
            const summaryRes = await fetch(`${API_BASE}/analytics/summary`);
            const summaryData = await summaryRes.json();
            setSummary(summaryData);

            const tradesRes = await fetch(`${API_BASE}/trades`);
            const tradesData = await tradesRes.json();
            setTrades(tradesData);
        } catch (err) {
            console.error("Failed to fetch dashboard data:", err);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 10000); // Poll every 10s
        return () => clearInterval(interval);
    }, []);

    const handleSaveJournal = async () => {
        if (!selectedTrade) return;
        try {
            await fetch(`${API_BASE}/journal`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    trade_id: selectedTrade.id,
                    ...notes
                })
            });
            fetchData();
            setSelectedTrade(null);
        } catch (err) {
            console.error("Failed to save journal entry:", err);
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 text-white p-6">
            <header className="mb-8 border-b border-slate-700 pb-4 flex justify-between items-center">
                <h1 className="text-2xl font-bold tracking-wide">MAI Trading Journal</h1>
                <span className="text-xs bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full border border-emerald-500/30">
                    MT5 Sync Active
                </span>
            </header>

            {/* Analytics Metric Cards */}
            {summary && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                    <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                        <p className="text-slate-400 text-sm">Account Balance</p>
                        <p className="text-2xl font-bold">${summary.balance.toLocaleString()}</p>
                    </div>
                    <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                        <p className="text-slate-400 text-sm">Win Rate</p>
                        <p className="text-2xl font-bold text-emerald-400">{summary.win_rate}%</p>
                    </div>
                    <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                        <p className="text-slate-400 text-sm">Net PnL</p>
                        <p className={`text-2xl font-bold ${summary.total_net_pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            ${summary.total_net_pnl.toLocaleString()}
                        </p>
                    </div>
                    <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                        <p className="text-slate-400 text-sm">Profit Factor</p>
                        <p className="text-2xl font-bold">{summary.profit_factor}</p>
                    </div>
                </div>
            )}

            {/* Trade Log & Journal Drawer */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-slate-800 rounded-xl border border-slate-700 p-4">
                    <h2 className="text-lg font-semibold mb-4">Synced Executions</h2>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="text-slate-400 border-b border-slate-700">
                                <tr>
                                    <th className="pb-3">Symbol</th>
                                    <th className="pb-3">Type</th>
                                    <th className="pb-3">Volume</th>
                                    <th className="pb-3">Entry</th>
                                    <th className="pb-3">Exit</th>
                                    <th className="pb-3">Net PnL</th>
                                    <th className="pb-3">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/50">
                                {trades.map((t) => (
                                    <tr key={t.id} className="hover:bg-slate-700/30">
                                        <td className="py-3 font-medium">{t.symbol}</td>
                                        <td className={`py-3 ${t.type === "BUY" ? "text-emerald-400" : "text-rose-400"}`}>{t.type}</td>
                                        <td className="py-3">{t.volume}</td>
                                        <td className="py-3">{t.entry_price}</td>
                                        <td className="py-3">{t.exit_price}</td>
                                        <td className={`py-3 font-semibold ${t.net_pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                            ${t.net_pnl}
                                        </td>
                                        <td className="py-3">
                                            <button
                                                onClick={() => {
                                                    setSelectedTrade(t);
                                                    setNotes({
                                                        setup: t.journal_entry?.setup || "",
                                                        emotion: t.journal_entry?.emotion || "",
                                                        notes: t.journal_entry?.notes || "",
                                                        rating: t.journal_entry?.rating || 5
                                                    });
                                                }}
                                                className="text-xs bg-indigo-600 hover:bg-indigo-500 px-3 py-1 rounded-md"
                                            >
                                                {t.journal_entry ? "Edit Note" : "+ Journal"}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Journaling Drawer */}
                <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
                    <h2 className="text-lg font-semibold mb-4">
                        {selectedTrade ? `Journal Trade #${selectedTrade.position_id} (${selectedTrade.symbol})` : "Select a trade to journal"}
                    </h2>
                    {selectedTrade ? (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">Setup / Strategy</label>
                                <input
                                    type="text"
                                    value={notes.setup}
                                    onChange={(e) => setNotes({ ...notes, setup: e.target.value })}
                                    placeholder="e.g., Bull Flag Retest"
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">Emotional State</label>
                                <input
                                    type="text"
                                    value={notes.emotion}
                                    onChange={(e) => setNotes({ ...notes, emotion: e.target.value })}
                                    placeholder="e.g., Calm, Confident"
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">Trade Notes & Reflections</label>
                                <textarea
                                    rows={4}
                                    value={notes.notes}
                                    onChange={(e) => setNotes({ ...notes, notes: e.target.value })}
                                    placeholder="Why did you take this trade? Did you follow your rules?"
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-white"
                                />
                            </div>
                            <button
                                onClick={handleSaveJournal}
                                className="w-full bg-emerald-600 hover:bg-emerald-500 py-2 rounded-lg font-medium text-sm transition"
                            >
                                Save Reflection
                            </button>
                        </div>
                    ) : (
                        <p className="text-sm text-slate-500 italic">Click "+ Journal" on any trade ticket from the list to add setup tags, discipline ratings, and qualitative notes.</p>
                    )}
                </div>
            </div>
        </div>
    );
}