import React, { useEffect, useRef, useState } from 'react';
import { 
  createChart, 
  ColorType, 
  CandlestickSeries, 
  LineSeries, 
  HistogramSeries,
  createSeriesMarkers 
} from 'lightweight-charts';
import { AbsorptionBubblesPrimitive } from './AbsorptionBubblesPrimitive';
import { BarDeltaPrimitive } from './BarDeltaPrimitive';
import { VolumeProfilePrimitive } from './VolumeProfilePrimitive';

// Helper to sort and deduplicate series data by timestamp
const sanitizeData = (arr) => {
  if (!arr || arr.length === 0) return [];
  return [...arr]
    .sort((a, b) => a.time - b.time)
    .filter((item, idx, self) => idx === 0 || item.time > self[idx - 1].time);
};

export default function TradingViewChart({
  candles = [],
  anchorData = [],
  pressureData = [],
  indicators = {},
  zones = [],
  signals = [],
  liveSignal = null,
  orderFlow = null,     // { delta_series, imbalance_zones, live }
  symbol = 'XAUUSD',
  timeframe = 'M15',
  height = 560,
  refreshInterval = 1000,
  onRefreshIntervalChange = null,
  orderFlowLimit = 50,
  onOrderFlowLimitChange = null
}) {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const anchorSeriesRef = useRef(null);
  const bbSeriesRef = useRef({ upper: null, middle: null, lower: null });
  const bbmaSeriesRef = useRef({
    upper: null,
    mid: null,
    lower: null,
    ma5_high: null,
    ma5_low: null,
    ma10_high: null,
    ma10_low: null,
    ema50: null,
  });
  const subPaneRef = useRef({ type: null, series: [] });
  const candlePriceLinesRef = useRef([]);
  const markersPrimitiveRef = useRef(null);
  const absBubblesPrimitiveRef = useRef(null); // Canvas primitive for footprint bubbles
  const barDeltaPrimitiveRef = useRef(null); // Canvas primitive for bar delta numbers
  const volumeProfilePrimitiveRef = useRef(null); // Canvas primitive for volume profile

  // Track hovered candle from crosshair for dynamic delta inspection
  const [hoverInfo, setHoverInfo] = useState(null);

  // Track whether initial fitContent has happened for the active symbol & timeframe
  const hasFittedRef = useRef(false);
  const prevSymbolTfRef = useRef(`${symbol}_${timeframe}`);

  // Indicator Visibility Toggles
  // All indicators and signals OFF by default for a clean chart
  const [showSignals, setShowSignals] = useState(false);
  const [showAnchor, setShowAnchor] = useState(false);
  const [showBollinger, setShowBollinger] = useState(false);
  const [showBBMA, setShowBBMA] = useState(false);
  const [subPane, setSubPane] = useState('none'); // 'pressure' | 'rsi' | 'macd' | 'delta' | 'absorption' | 'none'
  const [showZones, setShowZones] = useState(false);
  const [showImbalances, setShowImbalances] = useState(false);
  const [showAbsBubbles, setShowAbsBubbles] = useState(false);
  const [showBarDelta, setShowBarDelta] = useState(false);
  const [bubbleFilter, setBubbleFilter] = useState('ALL'); // 'ALL' | 'BUYER' | 'SELLER'
  const [showTargets, setShowTargets] = useState(false);
  const [showVolumeProfile, setShowVolumeProfile] = useState(false);

  // Fast map of candle time -> delta metrics
  const deltaMap = React.useMemo(() => {
    const map = new Map();
    if (orderFlow?.delta_series) {
      orderFlow.delta_series.forEach((d) => {
        map.set(d.time, { delta: d.value, color: d.color });
      });
    }
    if (orderFlow?.summary) {
      orderFlow.summary.forEach((s) => {
        const existing = map.get(s.time) || {};
        map.set(s.time, {
          ...existing,
          delta: s.delta,
          buy_vol: s.buy_vol,
          sell_vol: s.sell_vol,
          total_vol: s.total_vol,
        });
      });
    }
    return map;
  }, [orderFlow]);

  // Active candle inspection bar (from hover or latest candle)
  const activeInspection = React.useMemo(() => {
    let targetTime = hoverInfo?.time;
    let bar = hoverInfo;

    if (!targetTime && candles?.length > 0) {
      const lastCandle = candles[candles.length - 1];
      targetTime = lastCandle.time;
      bar = lastCandle;
    }

    if (!bar) return null;

    const deltaInfo = deltaMap.get(targetTime);
    const d = new Date(targetTime * 1000);
    const formattedTime = `${d.getUTCHours().toString().padStart(2, '0')}:${d.getUTCMinutes().toString().padStart(2, '0')} UTC`;

    return {
      formattedTime,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      delta: deltaInfo?.delta,
      buy_vol: deltaInfo?.buy_vol,
      sell_vol: deltaInfo?.sell_vol,
      total_vol: deltaInfo?.total_vol,
    };
  }, [hoverInfo, candles, deltaMap]);

  // -------------------------------------------------------------
  // 1. Chart Lifecycle: Created ONCE, destroyed only on unmount/height change
  // -------------------------------------------------------------
  useEffect(() => {
    if (!chartContainerRef.current) return;

    let chart = null;
    try {
      const hasSubPane = subPane !== 'none';

      chart = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth || 600,
        height: height,
        layout: {
          background: { type: ColorType.Solid, color: '#0B0F19' },
          textColor: '#94A3B8',
          fontSize: 12,
          attributionLogo: false,
        },
        grid: {
          vertLines: { color: 'rgba(255, 255, 255, 0.04)' },
          horzLines: { color: 'rgba(255, 255, 255, 0.04)' },
        },
        crosshair: {
          mode: 1,
        },
        rightPriceScale: {
          borderColor: 'rgba(255, 255, 255, 0.1)',
          scaleMargins: {
            top: 0.08,
            bottom: hasSubPane ? 0.28 : 0.08,
          },
        },
        timeScale: {
          borderColor: 'rgba(255, 255, 255, 0.1)',
          timeVisible: true,
          secondsVisible: false,
        },
      });

      chartRef.current = chart;

      // Base Candlestick Series (persistent)
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#10B981',
        downColor: '#EF4444',
        borderVisible: false,
        wickUpColor: '#10B981',
        wickDownColor: '#EF4444',
      });
      candleSeriesRef.current = candleSeries;

      // Subscribe to crosshair move for dynamic candle & delta inspection
      chart.subscribeCrosshairMove((param) => {
        if (!param.time || !param.seriesData) {
          setHoverInfo(null);
          return;
        }
        const barData = param.seriesData.get(candleSeries);
        if (!barData) {
          setHoverInfo(null);
          return;
        }
        setHoverInfo({
          time: param.time,
          open: barData.open,
          high: barData.high,
          low: barData.low,
          close: barData.close,
        });
      });

      const handleResize = () => {
        if (chartContainerRef.current && chart) {
          chart.applyOptions({ width: chartContainerRef.current.clientWidth });
        }
      };
      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        if (chart) {
          try { chart.remove(); } catch (_) {}
        }
        chartRef.current = null;
        candleSeriesRef.current = null;
        anchorSeriesRef.current = null;
        bbSeriesRef.current = { upper: null, middle: null, lower: null };
        bbmaSeriesRef.current = {
          upper: null,
          mid: null,
          lower: null,
          ma5_high: null,
          ma5_low: null,
          ma10_high: null,
          ma10_low: null,
          ema50: null,
        };
        subPaneRef.current = { type: null, series: [] };
        candlePriceLinesRef.current = [];
        markersPrimitiveRef.current = null;
        absBubblesPrimitiveRef.current = null;
        barDeltaPrimitiveRef.current = null;
      };
    } catch (err) {
      console.error('TradingView Chart creation error:', err);
      if (chart) {
        try { chart.remove(); } catch (_) {}
      }
    }
  }, [height]);

  // -------------------------------------------------------------
  // 2. Sub-Pane Structure Update (Swaps sub-pane without destroying chart)
  // -------------------------------------------------------------
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const hasSubPane = subPane !== 'none';
    chart.priceScale('right').applyOptions({
      scaleMargins: {
        top: 0.08,
        bottom: hasSubPane ? 0.28 : 0.08,
      },
    });

    // Remove old sub-pane series
    if (subPaneRef.current.series.length > 0) {
      subPaneRef.current.series.forEach((s) => {
        try { chart.removeSeries(s); } catch (_) {}
      });
    }
    subPaneRef.current = { type: subPane, series: [] };

    // Instantiate new sub-pane series
    if (subPane === 'pressure') {
      const hist = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'percent' },
        priceScaleId: 'sub_scale',
        title: 'Pressure Bias %',
      });
      try {
        chart.priceScale('sub_scale').applyOptions({
          scaleMargins: { top: 0.78, bottom: 0.02 },
          borderColor: 'rgba(255, 255, 255, 0.1)',
        });
      } catch (_) {}
      subPaneRef.current.series = [hist];
      if (pressureData?.length > 0) {
        hist.setData(sanitizeData(pressureData));
      }
    } else if (subPane === 'rsi') {
      const rsiLine = chart.addSeries(LineSeries, {
        color: '#818CF8',
        lineWidth: 2,
        priceScaleId: 'sub_scale',
        title: 'RSI(14)',
        priceLineVisible: false,
      });
      try {
        chart.priceScale('sub_scale').applyOptions({
          scaleMargins: { top: 0.78, bottom: 0.02 },
          borderColor: 'rgba(255, 255, 255, 0.1)',
        });
        rsiLine.createPriceLine({
          price: 70,
          color: 'rgba(239, 68, 68, 0.4)',
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: 'Overbought 70',
        });
        rsiLine.createPriceLine({
          price: 30,
          color: 'rgba(16, 185, 129, 0.4)',
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: 'Oversold 30',
        });
      } catch (_) {}
      subPaneRef.current.series = [rsiLine];
      if (indicators?.rsi?.length > 0) {
        rsiLine.setData(sanitizeData(indicators.rsi));
      }
    } else if (subPane === 'macd') {
      const hist = chart.addSeries(HistogramSeries, {
        priceScaleId: 'sub_scale',
        title: 'MACD Hist',
        priceLineVisible: false,
      });
      const macdLine = chart.addSeries(LineSeries, {
        color: '#38BDF8',
        lineWidth: 1.5,
        priceScaleId: 'sub_scale',
        title: 'MACD (12, 26)',
        priceLineVisible: false,
      });
      const sigLine = chart.addSeries(LineSeries, {
        color: '#F472B6',
        lineWidth: 1.5,
        priceScaleId: 'sub_scale',
        title: 'Signal (9)',
        priceLineVisible: false,
      });
      try {
        chart.priceScale('sub_scale').applyOptions({
          scaleMargins: { top: 0.78, bottom: 0.02 },
          borderColor: 'rgba(255, 255, 255, 0.1)',
        });
      } catch (_) {}
      subPaneRef.current.series = [hist, macdLine, sigLine];
      if (indicators?.macd_histogram?.length > 0) hist.setData(sanitizeData(indicators.macd_histogram));
      if (indicators?.macd?.length > 0) macdLine.setData(sanitizeData(indicators.macd));
      if (indicators?.macd_signal?.length > 0) sigLine.setData(sanitizeData(indicators.macd_signal));
    } else if (subPane === 'delta') {
      const deltaSeries = chart.addSeries(HistogramSeries, {
        priceScaleId: 'sub_scale',
        title: 'CoinGlass Order Flow Delta',
        priceLineVisible: false,
        priceFormat: { type: 'volume' },
      });
      try {
        chart.priceScale('sub_scale').applyOptions({
          scaleMargins: { top: 0.78, bottom: 0.02 },
          borderColor: 'rgba(255, 255, 255, 0.1)',
        });
        deltaSeries.createPriceLine({
          price: 0,
          color: 'rgba(255, 255, 255, 0.3)',
          lineWidth: 1,
          lineStyle: 0,
          axisLabelVisible: false,
        });
      } catch (_) {}
      subPaneRef.current.series = [deltaSeries];
      if (orderFlow?.delta_series?.length > 0) {
        deltaSeries.setData(sanitizeData(orderFlow.delta_series));
      }
    } else if (subPane === 'absorption') {
      const absSeries = chart.addSeries(HistogramSeries, {
        priceScaleId: 'sub_scale',
        title: 'Absorption Bubbles (High Buyer / Seller)',
        priceLineVisible: false,
        priceFormat: { type: 'percent' },
      });
      try {
        chart.priceScale('sub_scale').applyOptions({
          scaleMargins: { top: 0.78, bottom: 0.02 },
          borderColor: 'rgba(255, 255, 255, 0.1)',
        });
        absSeries.createPriceLine({
          price: 0.5,
          color: 'rgba(249, 115, 22, 0.4)',
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: 'Moderate',
        });
        absSeries.createPriceLine({
          price: 0.75,
          color: 'rgba(249, 115, 22, 0.7)',
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: 'Strong',
        });
      } catch (_) {}
      subPaneRef.current.series = [absSeries];
      if (orderFlow?.absorption_series?.length > 0) {
        absSeries.setData(sanitizeData(orderFlow.absorption_series));
      }
    } else if (subPane === 'adx') {
      const adxLine = chart.addSeries(LineSeries, {
        color: '#FBBF24',
        lineWidth: 2,
        priceScaleId: 'sub_scale',
        title: 'ADX(14)',
        priceLineVisible: false,
      });
      const plusDiLine = chart.addSeries(LineSeries, {
        color: '#10B981',
        lineWidth: 1.5,
        priceScaleId: 'sub_scale',
        title: '+DI',
        priceLineVisible: false,
      });
      const minusDiLine = chart.addSeries(LineSeries, {
        color: '#EF4444',
        lineWidth: 1.5,
        priceScaleId: 'sub_scale',
        title: '-DI',
        priceLineVisible: false,
      });
      try {
        chart.priceScale('sub_scale').applyOptions({
          scaleMargins: { top: 0.78, bottom: 0.02 },
          borderColor: 'rgba(255, 255, 255, 0.1)',
        });
        adxLine.createPriceLine({
          price: 25,
          color: 'rgba(251, 191, 36, 0.35)',
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: 'Trend 25',
        });
        adxLine.createPriceLine({
          price: 40,
          color: 'rgba(251, 191, 36, 0.60)',
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: 'Strong 40',
        });
      } catch (_) {}
      subPaneRef.current.series = [adxLine, plusDiLine, minusDiLine];
      if (indicators?.adx?.length > 0) adxLine.setData(sanitizeData(indicators.adx));
      if (indicators?.plus_di?.length > 0) plusDiLine.setData(sanitizeData(indicators.plus_di));
      if (indicators?.minus_di?.length > 0) minusDiLine.setData(sanitizeData(indicators.minus_di));
    }
  }, [subPane]);

  // -------------------------------------------------------------
  // 3. Live Data Streaming: Updates existing series smoothly (NO chart reload)
  // -------------------------------------------------------------
  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    if (!chart || !candleSeries) return;

    // Detect symbol or timeframe switch -> allow one fitContent() for the new feed
    const currentSymbolTf = `${symbol}_${timeframe}`;
    if (prevSymbolTfRef.current !== currentSymbolTf) {
      prevSymbolTfRef.current = currentSymbolTf;
      hasFittedRef.current = false;
    }

    // A. Update Main Candlesticks (smooth continuation in place)
    if (candles && candles.length > 0) {
      candleSeries.setData(sanitizeData(candles));

      // Only fit view once on initial load for this symbol/timeframe
      if (!hasFittedRef.current) {
        chart.timeScale().fitContent();
        hasFittedRef.current = true;
      }
    }

    // B. Anchor EMA(21) Series
    if (showAnchor && anchorData && anchorData.length > 0) {
      if (!anchorSeriesRef.current) {
        anchorSeriesRef.current = chart.addSeries(LineSeries, {
          color: '#F59E0B',
          lineWidth: 2,
          title: 'Anchor EMA(21)',
          priceLineVisible: false,
        });
      }
      anchorSeriesRef.current.setData(sanitizeData(anchorData));
    } else if (!showAnchor && anchorSeriesRef.current) {
      try { chart.removeSeries(anchorSeriesRef.current); } catch (_) {}
      anchorSeriesRef.current = null;
    }

    // C. Bollinger Bands Overlay
    if (showBollinger && indicators) {
      const { bb_upper = [], bb_middle = [], bb_lower = [] } = indicators;
      if (!bbSeriesRef.current.upper && bb_upper.length > 0) {
        bbSeriesRef.current.upper = chart.addSeries(LineSeries, {
          color: 'rgba(56, 189, 248, 0.6)',
          lineWidth: 1,
          lineStyle: 2,
          title: 'BB Upper',
          priceLineVisible: false,
        });
      }
      if (!bbSeriesRef.current.middle && bb_middle.length > 0) {
        bbSeriesRef.current.middle = chart.addSeries(LineSeries, {
          color: 'rgba(56, 189, 248, 0.4)',
          lineWidth: 1,
          title: 'BB Mid (SMA 20)',
          priceLineVisible: false,
        });
      }
      if (!bbSeriesRef.current.lower && bb_lower.length > 0) {
        bbSeriesRef.current.lower = chart.addSeries(LineSeries, {
          color: 'rgba(56, 189, 248, 0.6)',
          lineWidth: 1,
          lineStyle: 2,
          title: 'BB Lower',
          priceLineVisible: false,
        });
      }

      if (bbSeriesRef.current.upper && bb_upper.length > 0) bbSeriesRef.current.upper.setData(sanitizeData(bb_upper));
      if (bbSeriesRef.current.middle && bb_middle.length > 0) bbSeriesRef.current.middle.setData(sanitizeData(bb_middle));
      if (bbSeriesRef.current.lower && bb_lower.length > 0) bbSeriesRef.current.lower.setData(sanitizeData(bb_lower));
    } else if (!showBollinger && (bbSeriesRef.current.upper || bbSeriesRef.current.middle || bbSeriesRef.current.lower)) {
      if (bbSeriesRef.current.upper) { try { chart.removeSeries(bbSeriesRef.current.upper); } catch (_) {} }
      if (bbSeriesRef.current.middle) { try { chart.removeSeries(bbSeriesRef.current.middle); } catch (_) {} }
      if (bbSeriesRef.current.lower) { try { chart.removeSeries(bbSeriesRef.current.lower); } catch (_) {} }
      bbSeriesRef.current = { upper: null, middle: null, lower: null };
    }

    // C2. BBMA Overlay (Bollinger Bands + MA 5/10 High & Low + EMA 50)
    if (showBBMA && indicators) {
      const {
        bb_upper = [],
        bb_middle = [],
        bb_lower = [],
        bbma_ma5_high = [],
        bbma_ma5_low = [],
        bbma_ma10_high = [],
        bbma_ma10_low = [],
        bbma_ema50 = [],
      } = indicators;

      if (!bbmaSeriesRef.current.upper && bb_upper.length > 0) {
        bbmaSeriesRef.current.upper = chart.addSeries(LineSeries, {
          color: '#38BDF8',
          lineWidth: 1,
          lineStyle: 2,
          title: 'Top BB',
          priceLineVisible: false,
        });
      }
      if (!bbmaSeriesRef.current.mid && bb_middle.length > 0) {
        bbmaSeriesRef.current.mid = chart.addSeries(LineSeries, {
          color: 'rgba(255, 255, 255, 0.4)',
          lineWidth: 1,
          lineStyle: 1,
          title: 'Mid BB (SMA 20)',
          priceLineVisible: false,
        });
      }
      if (!bbmaSeriesRef.current.lower && bb_lower.length > 0) {
        bbmaSeriesRef.current.lower = chart.addSeries(LineSeries, {
          color: '#38BDF8',
          lineWidth: 1,
          lineStyle: 2,
          title: 'Low BB',
          priceLineVisible: false,
        });
      }
      if (!bbmaSeriesRef.current.ma5_high && bbma_ma5_high.length > 0) {
        bbmaSeriesRef.current.ma5_high = chart.addSeries(LineSeries, {
          color: 'rgba(239, 68, 68, 0.75)',
          lineWidth: 1,
          lineStyle: 3,
          title: 'MA5 High',
          priceLineVisible: false,
        });
      }
      if (!bbmaSeriesRef.current.ma5_low && bbma_ma5_low.length > 0) {
        bbmaSeriesRef.current.ma5_low = chart.addSeries(LineSeries, {
          color: 'rgba(16, 185, 129, 0.75)',
          lineWidth: 1,
          lineStyle: 3,
          title: 'MA5 Low',
          priceLineVisible: false,
        });
      }
      if (!bbmaSeriesRef.current.ma10_high && bbma_ma10_high.length > 0) {
        bbmaSeriesRef.current.ma10_high = chart.addSeries(LineSeries, {
          color: 'rgba(244, 114, 182, 0.75)',
          lineWidth: 1,
          lineStyle: 3,
          title: 'MA10 High',
          priceLineVisible: false,
        });
      }
      if (!bbmaSeriesRef.current.ma10_low && bbma_ma10_low.length > 0) {
        bbmaSeriesRef.current.ma10_low = chart.addSeries(LineSeries, {
          color: 'rgba(52, 211, 153, 0.75)',
          lineWidth: 1,
          lineStyle: 3,
          title: 'MA10 Low',
          priceLineVisible: false,
        });
      }
      if (!bbmaSeriesRef.current.ema50 && bbma_ema50.length > 0) {
        bbmaSeriesRef.current.ema50 = chart.addSeries(LineSeries, {
          color: '#F59E0B',
          lineWidth: 2,
          lineStyle: 0,
          title: 'EMA 50 Trend',
          priceLineVisible: false,
        });
      }

      if (bbmaSeriesRef.current.upper && bb_upper.length > 0) bbmaSeriesRef.current.upper.setData(sanitizeData(bb_upper));
      if (bbmaSeriesRef.current.mid && bb_middle.length > 0) bbmaSeriesRef.current.mid.setData(sanitizeData(bb_middle));
      if (bbmaSeriesRef.current.lower && bb_lower.length > 0) bbmaSeriesRef.current.lower.setData(sanitizeData(bb_lower));
      if (bbmaSeriesRef.current.ma5_high && bbma_ma5_high.length > 0) bbmaSeriesRef.current.ma5_high.setData(sanitizeData(bbma_ma5_high));
      if (bbmaSeriesRef.current.ma5_low && bbma_ma5_low.length > 0) bbmaSeriesRef.current.ma5_low.setData(sanitizeData(bbma_ma5_low));
      if (bbmaSeriesRef.current.ma10_high && bbma_ma10_high.length > 0) bbmaSeriesRef.current.ma10_high.setData(sanitizeData(bbma_ma10_high));
      if (bbmaSeriesRef.current.ma10_low && bbma_ma10_low.length > 0) bbmaSeriesRef.current.ma10_low.setData(sanitizeData(bbma_ma10_low));
      if (bbmaSeriesRef.current.ema50 && bbma_ema50.length > 0) bbmaSeriesRef.current.ema50.setData(sanitizeData(bbma_ema50));
    } else if (!showBBMA) {
      Object.keys(bbmaSeriesRef.current).forEach((k) => {
        if (bbmaSeriesRef.current[k]) {
          try { chart.removeSeries(bbmaSeriesRef.current[k]); } catch (_) {}
          bbmaSeriesRef.current[k] = null;
        }
      });
    }

    // D. Update Active Sub-Pane Series Data
    if (subPane === 'pressure' && subPaneRef.current.series[0] && pressureData?.length > 0) {
      subPaneRef.current.series[0].setData(sanitizeData(pressureData));
    } else if (subPane === 'rsi' && subPaneRef.current.series[0] && indicators?.rsi?.length > 0) {
      subPaneRef.current.series[0].setData(sanitizeData(indicators.rsi));
    } else if (subPane === 'macd' && subPaneRef.current.series.length === 3) {
      const [hist, macdLine, sigLine] = subPaneRef.current.series;
      if (indicators?.macd_histogram?.length > 0) hist.setData(sanitizeData(indicators.macd_histogram));
      if (indicators?.macd?.length > 0) macdLine.setData(sanitizeData(indicators.macd));
      if (indicators?.macd_signal?.length > 0) sigLine.setData(sanitizeData(indicators.macd_signal));
    } else if (subPane === 'delta' && subPaneRef.current.series[0] && orderFlow?.delta_series?.length > 0) {
      subPaneRef.current.series[0].setData(sanitizeData(orderFlow.delta_series));
    } else if (subPane === 'absorption' && subPaneRef.current.series[0] && orderFlow?.absorption_series?.length > 0) {
      subPaneRef.current.series[0].setData(sanitizeData(orderFlow.absorption_series));
    } else if (subPane === 'adx' && subPaneRef.current.series.length === 3) {
      const [adxLine, plusDiLine, minusDiLine] = subPaneRef.current.series;
      if (indicators?.adx?.length > 0) adxLine.setData(sanitizeData(indicators.adx));
      if (indicators?.plus_di?.length > 0) plusDiLine.setData(sanitizeData(indicators.plus_di));
      if (indicators?.minus_di?.length > 0) minusDiLine.setData(sanitizeData(indicators.minus_di));
    }

    // E. Clear and re-apply Price Lines on Candlestick Series (Zones, Imbalances, SL/TP)
    if (candlePriceLinesRef.current.length > 0) {
      candlePriceLinesRef.current.forEach((line) => {
        try { candleSeries.removePriceLine(line); } catch (_) {}
      });
      candlePriceLinesRef.current = [];
    }

    // Imbalance Zones
    if (showImbalances && orderFlow?.imbalance_zones?.length > 0) {
      const sorted = [...orderFlow.imbalance_zones]
        .sort((a, b) => b.ratio - a.ratio)
        .slice(0, 10);

      sorted.forEach((z) => {
        const isBuy = z.type === 'BUY_DOM' || z.type === 'BUY_ONLY';
        const lineColor = isBuy ? 'rgba(16, 185, 129, 0.8)' : 'rgba(239, 68, 68, 0.8)';
        const label = `${isBuy ? '⬆' : '⬇'} ${z.type} ${z.ratio}x`;

        try {
          const l1 = candleSeries.createPriceLine({
            price: z.price_high,
            color: lineColor,
            lineWidth: 1,
            lineStyle: 3,
            axisLabelVisible: true,
            title: label,
          });
          const l2 = candleSeries.createPriceLine({
            price: z.price_low,
            color: lineColor,
            lineWidth: 1,
            lineStyle: 3,
            axisLabelVisible: false,
          });
          candlePriceLinesRef.current.push(l1, l2);
        } catch (_) {}
      });
    }

    // Absorption Bubbles — canvas circles via LWC custom primitive (like TradingView footprint)
    const rawBubbles = orderFlow?.absorption_bubbles || orderFlow?.absorption_zones || [];
    if (showAbsBubbles && rawBubbles.length > 0) {
      // Lazy-create primitive and attach to candleSeries once
      if (!absBubblesPrimitiveRef.current) {
        try {
          const primitive = new AbsorptionBubblesPrimitive();
          candleSeries.attachPrimitive(primitive);
          absBubblesPrimitiveRef.current = primitive;
        } catch (err) {
          console.warn('AbsorptionBubblesPrimitive attach error:', err);
        }
      }
      // Push latest data + current filter into the primitive
      if (absBubblesPrimitiveRef.current) {
        absBubblesPrimitiveRef.current.setBubbles(rawBubbles, bubbleFilter);
      }
    } else {
      // showAbsBubbles OFF or no data → detach primitive if it exists
      if (absBubblesPrimitiveRef.current) {
        try {
          absBubblesPrimitiveRef.current.setBubbles([], bubbleFilter); // clear canvas
        } catch (_) {}
        // LWC v5: detach is called on the primitive itself
        try {
          absBubblesPrimitiveRef.current.detached && absBubblesPrimitiveRef.current.detached();
        } catch (_) {}
        try {
          // Some LWC v5 builds expose series.detachPrimitive; fallback to primitive._series removal
          if (typeof candleSeries.detachPrimitive === 'function') {
            candleSeries.detachPrimitive(absBubblesPrimitiveRef.current);
          }
        } catch (_) {}
        absBubblesPrimitiveRef.current = null;
      }
    }

    // Bar Delta Numbers on Candles (Footprint bar delta)
    if (showBarDelta && deltaMap.size > 0 && candles?.length > 0) {
      if (!barDeltaPrimitiveRef.current) {
        try {
          const primitive = new BarDeltaPrimitive();
          candleSeries.attachPrimitive(primitive);
          barDeltaPrimitiveRef.current = primitive;
        } catch (err) {
          console.warn('BarDeltaPrimitive attach error:', err);
        }
      }
      if (barDeltaPrimitiveRef.current) {
        barDeltaPrimitiveRef.current.setData(deltaMap, candles);
      }
    } else {
      if (barDeltaPrimitiveRef.current) {
        try {
          if (typeof candleSeries.detachPrimitive === 'function') {
            candleSeries.detachPrimitive(barDeltaPrimitiveRef.current);
          }
        } catch (_) {}
        barDeltaPrimitiveRef.current = null;
      }
    }

    // Volume Profile (VPVR-style histogram) — LWC v5 canvas primitive
    if (showVolumeProfile && orderFlow?.volume_profile?.bins?.length > 0) {
      if (!volumeProfilePrimitiveRef.current) {
        try {
          const prim = new VolumeProfilePrimitive();
          candleSeries.attachPrimitive(prim);
          volumeProfilePrimitiveRef.current = prim;
        } catch (err) {
          console.warn('VolumeProfilePrimitive attach error:', err);
        }
      }
      if (volumeProfilePrimitiveRef.current) {
        volumeProfilePrimitiveRef.current.setData(orderFlow.volume_profile);
      }
    } else {
      if (volumeProfilePrimitiveRef.current) {
        try {
          if (typeof candleSeries.detachPrimitive === 'function') {
            candleSeries.detachPrimitive(volumeProfilePrimitiveRef.current);
          }
        } catch (_) {}
        volumeProfilePrimitiveRef.current = null;
      }
    }

    // SMC Zones (OB & FVG)
    if (showZones && zones && zones.length > 0) {
      zones.slice(-6).forEach((z) => {
        const isOB = z.kind === 'OB';
        const labelPrefix = isOB ? (z.is_bull ? 'Bullish OB' : 'Bearish OB') : (z.is_bull ? 'Bullish FVG' : 'Bearish FVG');
        const lineColor = z.border_color || (z.is_bull ? '#10B981' : '#EF4444');

        try {
          const topL = candleSeries.createPriceLine({
            price: z.top,
            color: lineColor,
            lineWidth: 1,
            lineStyle: 1,
            axisLabelVisible: true,
            title: `${labelPrefix} Top: $${z.top}`,
          });
          const botL = candleSeries.createPriceLine({
            price: z.bot,
            color: lineColor,
            lineWidth: 1,
            lineStyle: 1,
            axisLabelVisible: false,
            title: `${labelPrefix} Bot: $${z.bot}`,
          });
          candlePriceLinesRef.current.push(topL, botL);
        } catch (_) {}
      });
    }

    // Live Trade Targets (Entry, SL, TP)
    if (showTargets && liveSignal && liveSignal.signal !== 'WAIT' && liveSignal.entry_price) {
      try {
        const entryL = candleSeries.createPriceLine({
          price: liveSignal.entry_price,
          color: '#60A5FA',
          lineWidth: 2,
          lineStyle: 0,
          axisLabelVisible: true,
          title: `ENTRY: $${liveSignal.entry_price}`,
        });
        candlePriceLinesRef.current.push(entryL);

        if (liveSignal.stop_loss) {
          const slL = candleSeries.createPriceLine({
            price: liveSignal.stop_loss,
            color: '#F87171',
            lineWidth: 2,
            lineStyle: 2,
            axisLabelVisible: true,
            title: `SL: $${liveSignal.stop_loss}`,
          });
          candlePriceLinesRef.current.push(slL);
        }

        if (liveSignal.take_profit) {
          const tpL = candleSeries.createPriceLine({
            price: liveSignal.take_profit,
            color: '#34D399',
            lineWidth: 2,
            lineStyle: 2,
            axisLabelVisible: true,
            title: `TP: $${liveSignal.take_profit}`,
          });
          candlePriceLinesRef.current.push(tpL);
        }
      } catch (_) {}
    }

    // F. Signal Markers
    if (showSignals && signals && signals.length > 0 && candles && candles.length > 0) {
      const markers = [];
      signals.forEach((sig) => {
        const sigSec = Math.floor(new Date(sig.time).getTime() / 1000);
        const gradeTag = sig.quality_grade ? ` [${sig.quality_grade.replace(' ELITE', '+').replace(' HIGH', '')}]` : '';
        markers.push({
          time: sigSec,
          position: sig.signal === 'BUY' ? 'belowBar' : 'aboveBar',
          color: sig.signal === 'BUY' ? '#10B981' : '#EF4444',
          shape: sig.signal === 'BUY' ? 'arrowUp' : 'arrowDown',
          text: `${sig.signal}${gradeTag} (${sig.confluence_score}✦)`,
        });
      });

      const sortedCandles = sanitizeData(candles);
      const minTime = sortedCandles[0]?.time;
      const maxTime = sortedCandles[sortedCandles.length - 1]?.time;
      const validMarkers = markers
        .filter((m) => m.time >= minTime && m.time <= maxTime)
        .sort((a, b) => a.time - b.time)
        .filter((m, idx, arr) => idx === 0 || m.time !== arr[idx - 1].time);

      if (markersPrimitiveRef.current) {
        try {
          markersPrimitiveRef.current.setMarkers(validMarkers);
        } catch (_) {
          try {
            markersPrimitiveRef.current.detach();
          } catch (_) {}
          markersPrimitiveRef.current = null;
        }
      }
      if (!markersPrimitiveRef.current && validMarkers.length > 0 && typeof createSeriesMarkers === 'function') {
        try {
          markersPrimitiveRef.current = createSeriesMarkers(candleSeries, validMarkers);
        } catch (markerErr) {
          console.warn('createSeriesMarkers warning:', markerErr);
        }
      }
    } else {
      if (markersPrimitiveRef.current) {
        try {
          markersPrimitiveRef.current.setMarkers([]);
        } catch (_) {}
      }
    }
  }, [
    candles, 
    anchorData, 
    pressureData, 
    indicators, 
    zones, 
    signals, 
    liveSignal, 
    orderFlow, 
    showSignals,
    showAnchor, 
    showBollinger, 
    showBBMA,
    showZones, 
    showImbalances, 
    showAbsBubbles,
    showBarDelta,
    showVolumeProfile,
    deltaMap,
    bubbleFilter,
    showTargets, 
    symbol, 
    timeframe
  ]);

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {/* Top Header Controls & Indicator Toggles */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        background: 'rgba(0, 0, 0, 0.4)',
        padding: '10px 14px',
        borderRadius: '10px 10px 0 0',
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)'
      }}>
        {/* Symbol & Timeframe badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#FFFFFF' }}>
            {symbol}
          </span>
          <span style={{
            background: 'rgba(99, 102, 241, 0.2)',
            color: '#A5B4FC',
            border: '1px solid rgba(99, 102, 241, 0.4)',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '0.72rem',
            fontWeight: 700
          }}>
            {timeframe}
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Self-Hosted Feed ({refreshInterval > 0 ? `⚡ ${(refreshInterval / 1000).toFixed(0)}s Polling` : '⏸ Paused'})
          </span>
          {onRefreshIntervalChange && (
            <div style={{ display: 'flex', gap: '2px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', padding: '2px' }}>
              {[
                { label: '1s', val: 1000 },
                { label: '3s', val: 3000 },
                { label: '5s', val: 5000 },
                { label: '10s', val: 10000 },
                { label: '⏸', val: 0 }
              ].map(opt => (
                <button
                  key={opt.val}
                  onClick={() => onRefreshIntervalChange(opt.val)}
                  title={opt.val === 0 ? "Pause live streaming" : `Refresh every ${opt.label}`}
                  style={{
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: 'none',
                    background: refreshInterval === opt.val ? 'rgba(16, 185, 129, 0.35)' : 'transparent',
                    color: refreshInterval === opt.val ? '#34D399' : 'var(--text-dim)',
                    transition: 'all 0.12s ease'
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
          {onOrderFlowLimitChange && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '2px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', padding: '2px' }}>
              <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)', padding: '0 4px', fontWeight: 600 }}>OF Bars:</span>
              {[50, 100, 150, 200].map(cnt => (
                <button
                  key={cnt}
                  onClick={() => onOrderFlowLimitChange(cnt)}
                  title={`Fetch last ${cnt} order flow footprint candles`}
                  style={{
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: 'none',
                    background: orderFlowLimit === cnt ? 'rgba(56, 189, 248, 0.35)' : 'transparent',
                    color: orderFlowLimit === cnt ? '#38BDF8' : 'var(--text-dim)',
                    transition: 'all 0.12s ease'
                  }}
                >
                  {cnt}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Dynamic Indicator Toggles (Clickable) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Toggle: Signals */}
          <button
            onClick={() => setShowSignals(!showSignals)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '0.72rem',
              fontWeight: 600,
              cursor: 'pointer',
              border: showSignals ? '1px solid #10B981' : '1px solid rgba(255,255,255,0.1)',
              background: showSignals ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
              color: showSignals ? '#34D399' : 'var(--text-dim)',
              transition: 'all 0.15s ease'
            }}
          >
            ⚡ Signals {signals?.length ? `(${signals.length})` : ''}
          </button>

          {/* Toggle: Anchor EMA */}
          <button
            onClick={() => setShowAnchor(!showAnchor)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '0.72rem',
              fontWeight: 600,
              cursor: 'pointer',
              border: showAnchor ? '1px solid #F59E0B' : '1px solid rgba(255,255,255,0.1)',
              background: showAnchor ? 'rgba(245, 158, 11, 0.15)' : 'transparent',
              color: showAnchor ? '#FBBF24' : 'var(--text-dim)',
              transition: 'all 0.15s ease'
            }}
          >
            ● Anchor EMA(21)
          </button>

          {/* Toggle: Bollinger Bands */}
          <button
            onClick={() => setShowBollinger(!showBollinger)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '0.72rem',
              fontWeight: 600,
              cursor: 'pointer',
              border: showBollinger ? '1px solid #38BDF8' : '1px solid rgba(255,255,255,0.1)',
              background: showBollinger ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
              color: showBollinger ? '#38BDF8' : 'var(--text-dim)',
              transition: 'all 0.15s ease'
            }}
          >
            〰 Bollinger Bands
          </button>

          {/* Toggle: BBMA Channel */}
          <button
            onClick={() => setShowBBMA(!showBBMA)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '0.72rem',
              fontWeight: 600,
              cursor: 'pointer',
              border: showBBMA ? '1px solid #EC4899' : '1px solid rgba(255,255,255,0.1)',
              background: showBBMA ? 'rgba(236, 72, 153, 0.15)' : 'transparent',
              color: showBBMA ? '#F472B6' : 'var(--text-dim)',
              transition: 'all 0.15s ease'
            }}
          >
            〰 BBMA Channel
          </button>

          {/* Sub-Pane Selector (Pressure / RSI / MACD / ADX / Delta / Off) */}
          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', padding: '2px' }}>
            {[
              { id: 'pressure', label: '📊 Pressure' },
              { id: 'rsi', label: '📈 RSI' },
              { id: 'macd', label: '📉 MACD' },
              { id: 'adx', label: '⚡ ADX' },
              { id: 'delta', label: '⚡ Delta' },
              { id: 'absorption', label: '🫧 Abs Bubbles' },
              { id: 'none', label: 'Off' }
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setSubPane(p.id)}
                style={{
                  padding: '3px 8px',
                  borderRadius: '4px',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: 'none',
                  background: subPane === p.id ? 'rgba(99, 102, 241, 0.35)' : 'transparent',
                  color: subPane === p.id ? '#A5B4FC' : 'var(--text-dim)',
                  transition: 'all 0.15s ease'
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Toggle: Imbalance Zones (Order Flow) */}
          {orderFlow?.imbalance_zones?.length > 0 && (
            <button
              onClick={() => setShowImbalances(!showImbalances)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '0.72rem',
                fontWeight: 600,
                cursor: 'pointer',
                border: showImbalances ? '1px solid #F97316' : '1px solid rgba(255,255,255,0.1)',
                background: showImbalances ? 'rgba(249, 115, 22, 0.15)' : 'transparent',
                color: showImbalances ? '#FB923C' : 'var(--text-dim)',
                transition: 'all 0.15s ease'
              }}
            >
              🔥 Imbalances ({orderFlow.imbalance_zones.length})
            </button>
          )}

          {/* Toggle: Absorption Bubbles (High Buyer / High Seller) */}
          {(orderFlow?.absorption_bubbles?.length > 0 || orderFlow?.absorption_zones?.length > 0) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(0,0,0,0.25)', padding: '2px', borderRadius: '8px' }}>
              <button
                onClick={() => setShowAbsBubbles(!showAbsBubbles)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: showAbsBubbles ? '1px solid #10B981' : '1px solid rgba(255,255,255,0.1)',
                  background: showAbsBubbles ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                  color: showAbsBubbles ? '#34D399' : 'var(--text-dim)',
                  transition: 'all 0.15s ease'
                }}
              >
                🫧 Abs Bubbles ({(orderFlow?.absorption_bubbles || orderFlow?.absorption_zones).length})
              </button>
              {showAbsBubbles && (
                <div style={{ display: 'flex', gap: '2px', paddingLeft: '2px' }}>
                  {[
                    { id: 'ALL', label: 'All' },
                    { id: 'BUYER', label: '🟢 High Buyer' },
                    { id: 'SELLER', label: '🔴 High Seller' }
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setBubbleFilter(f.id)}
                      style={{
                        padding: '3px 6px',
                        borderRadius: '4px',
                        fontSize: '0.68rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        border: 'none',
                        background: bubbleFilter === f.id ? 'rgba(99, 102, 241, 0.4)' : 'transparent',
                        color: bubbleFilter === f.id ? '#FFFFFF' : 'var(--text-dim)',
                        transition: 'all 0.12s ease'
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Toggle: Footprint Bar Delta Numbers on Candles */}
          {deltaMap.size > 0 && (
            <button
              onClick={() => setShowBarDelta(!showBarDelta)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '0.72rem',
                fontWeight: 600,
                cursor: 'pointer',
                border: showBarDelta ? '1px solid #38BDF8' : '1px solid rgba(255,255,255,0.1)',
                background: showBarDelta ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                color: showBarDelta ? '#38BDF8' : 'var(--text-dim)',
                transition: 'all 0.15s ease'
              }}
            >
              ⚡ Bar Delta ({deltaMap.size})
            </button>
          )}

          {/* Toggle: Volume Profile (VPVR) */}
          {orderFlow?.volume_profile?.bins?.length > 0 && (
            <button
              onClick={() => setShowVolumeProfile(!showVolumeProfile)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '0.72rem',
                fontWeight: 600,
                cursor: 'pointer',
                border: showVolumeProfile ? '1px solid #FBBF24' : '1px solid rgba(255,255,255,0.1)',
                background: showVolumeProfile ? 'rgba(251, 191, 36, 0.15)' : 'transparent',
                color: showVolumeProfile ? '#FBBF24' : 'var(--text-dim)',
                transition: 'all 0.15s ease'
              }}
            >
              📊 Volume Profile
            </button>
          )}

          {/* Toggle: Zones (OB + FVG) */}
          <button
            onClick={() => setShowZones(!showZones)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '0.72rem',
              fontWeight: 600,
              cursor: 'pointer',
              border: showZones ? '1px solid #6366F1' : '1px solid rgba(255,255,255,0.1)',
              background: showZones ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
              color: showZones ? '#A5B4FC' : 'var(--text-dim)',
              transition: 'all 0.15s ease'
            }}
          >
            🎯 SMC Zones ({zones.length})
          </button>

          {/* Toggle: SL / TP Targets */}
          <button
            onClick={() => setShowTargets(!showTargets)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '0.72rem',
              fontWeight: 600,
              cursor: 'pointer',
              border: showTargets ? '1px solid #34D399' : '1px solid rgba(255,255,255,0.1)',
              background: showTargets ? 'rgba(52, 211, 153, 0.15)' : 'transparent',
              color: showTargets ? '#34D399' : 'var(--text-dim)',
              transition: 'all 0.15s ease'
            }}
          >
            📍 SL / TP Lines
          </button>
        </div>
      </div>

      {/* Candle & Order Flow Delta History Inspection Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        padding: '6px 14px',
        background: 'rgba(15, 23, 42, 0.75)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        fontSize: '0.75rem',
        minHeight: '32px'
      }}>
        {activeInspection ? (
          <>
            <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontWeight: 600 }}>
              {activeInspection.formattedTime}
            </span>
            <span>O: <strong style={{ color: '#F1F5F9' }}>{activeInspection.open}</strong></span>
            <span>H: <strong style={{ color: '#F1F5F9' }}>{activeInspection.high}</strong></span>
            <span>L: <strong style={{ color: '#F1F5F9' }}>{activeInspection.low}</strong></span>
            <span>
              C: <strong style={{ color: activeInspection.close >= activeInspection.open ? '#10B981' : '#EF4444' }}>
                {activeInspection.close}
              </strong>
            </span>

            {activeInspection.delta !== undefined ? (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 8px',
                borderRadius: '4px',
                fontWeight: 700,
                background: activeInspection.delta >= 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                color: activeInspection.delta >= 0 ? '#34D399' : '#F87171',
                border: activeInspection.delta >= 0 ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(239, 68, 68, 0.4)',
              }}>
                ⚡ Delta: {activeInspection.delta >= 0 ? `+${activeInspection.delta}` : activeInspection.delta}
                {activeInspection.buy_vol !== undefined && (
                  <span style={{ fontWeight: 500, opacity: 0.85, marginLeft: '4px', fontSize: '0.7rem' }}>
                    (🟢 {Math.round(activeInspection.buy_vol)}v · 🔴 {Math.round(activeInspection.sell_vol)}v)
                  </span>
                )}
              </span>
            ) : (
              <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>
                (Move cursor over any history candle to inspect its Order Flow Delta)
              </span>
            )}
          </>
        ) : (
          <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem' }}>
            💡 Hover cursor over any candle to inspect its Order Flow Delta value.
          </span>
        )}
      </div>

      {/* Chart Canvas Area */}
      <div
        ref={chartContainerRef}
        style={{
          width: '100%',
          height: `${height}px`,
          borderRadius: '0 0 12px 12px',
          overflow: 'hidden'
        }}
      />

      {/* Delta loading overlay */}
      {subPane === 'delta' && !orderFlow?.delta_series?.length && (
        <div style={{
          position: 'absolute',
          bottom: '30px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(15, 23, 42, 0.85)',
          border: '1px solid rgba(99, 102, 241, 0.4)',
          borderRadius: '8px',
          padding: '8px 16px',
          fontSize: '0.78rem',
          color: '#A5B4FC',
          pointerEvents: 'none',
        }}>
          ⚡ Loading Order Flow data from CoinGlass…
        </div>
      )}

      {/* Absorption loading overlay */}
      {subPane === 'absorption' && !orderFlow?.absorption_series?.length && (
        <div style={{
          position: 'absolute',
          bottom: '30px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(15, 23, 42, 0.85)',
          border: '1px solid rgba(16, 185, 129, 0.4)',
          borderRadius: '8px',
          padding: '8px 16px',
          fontSize: '0.78rem',
          color: '#34D399',
          pointerEvents: 'none',
        }}>
          🫧 Loading Absorption Bubbles from CoinGlass…
        </div>
      )}
    </div>
  );
}
