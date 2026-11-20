/**
 * AbsorptionBubblesPrimitive — LWC v5 Series Primitive
 *
 * Draws footprint-style absorption bubbles (circles) directly on the main
 * chart canvas at correct (time, price) pixel coordinates.
 *
 * LWC v5 SeriesPrimitive requirement:
 *   - paneView.zOrder() MUST return 'normal' (LWC only extracts 'normal' or 'bottom'
 *     for SeriesPrimitives; 'top' is ignored and never rendered!).
 *   - target.useBitmapCoordinateSpace with pixelRatio scaling ensures sharp
 *     retina rendering matching LWC's internal markers.
 */

// ─── Renderer ───────────────────────────────────────────────────────────────

class AbsorptionBubblesRenderer {
  constructor(source) {
    this._source = source;
  }

  draw(target /*, drawingUtils */) {
    const { _chart: chart, _series: series, _bubbles: bubbles, _filter: filter } = this._source;
    if (!chart || !series || !bubbles || bubbles.length === 0) return;

    // Filter by user selection
    const filtered = bubbles.filter((b) => {
      if (filter === 'BUYER') return b.type === 'HIGH_BUYER' || b.type === 'BUY_ABS';
      if (filter === 'SELLER') return b.type === 'HIGH_SELLER' || b.type === 'SELL_ABS';
      return true;
    });
    if (filtered.length === 0) return;

    // Enforce strictly 1 bubble per candle (highest volume node for each timestamp)
    const perCandleMap = new Map();
    filtered.forEach((b) => {
      const vol = b.total_vol || (b.buy_vol + b.sell_vol) || 0;
      const existing = perCandleMap.get(b.time);
      if (!existing || vol > (existing.total_vol || (existing.buy_vol + existing.sell_vol) || 0)) {
        perCandleMap.set(b.time, b);
      }
    });
    const visible = Array.from(perCandleMap.values());
    if (visible.length === 0) return;

    const timeScale = chart.timeScale();
    const maxVol = Math.max(...visible.map((b) => b.total_vol || (b.buy_vol + b.sell_vol) || 1), 1);
    const MAX_RADIUS = 22;
    const MIN_RADIUS = 5;

    const drawBubbles = (ctx, hpr = 1, vpr = 1) => {
      visible.forEach((b) => {
        const rawX = timeScale.timeToCoordinate(b.time);
        const rawY = series.priceToCoordinate(b.price || b.price_high);
        if (rawX === null || rawX === undefined || rawY === null || rawY === undefined) return;

        const x = Math.round(rawX * hpr);
        const y = Math.round(rawY * vpr);
        const vol = b.total_vol || (b.buy_vol + b.sell_vol) || 1;
        const normScale = Math.sqrt(vol / maxVol);
        const radius = (MIN_RADIUS + normScale * (MAX_RADIUS - MIN_RADIUS)) * ((hpr + vpr) / 2);

        const isBuyer = b.type === 'HIGH_BUYER' || b.type === 'BUY_ABS';
        const solidColor = isBuyer ? '#10B981' : '#EF4444';
        const fillAlpha = isBuyer ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)';
        const ringWidth = Math.max(1, (b.size_tier === 'LARGE' ? 2.5 : b.size_tier === 'MEDIUM' ? 1.8 : 1.2) * hpr);

        ctx.save();

        // Glow for large institutional contest nodes
        if (b.size_tier === 'LARGE') {
          ctx.shadowColor = solidColor;
          ctx.shadowBlur = 8 * hpr;
        }

        // Fill circle
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = fillAlpha;
        ctx.fill();

        // Reset shadow for crisp ring border
        ctx.shadowBlur = 0;

        // Ring border
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = solidColor;
        ctx.lineWidth = ringWidth;
        ctx.stroke();

        // Delta & Volume text inside readable bubbles
        const deltaVal = b.delta;
        const deltaStr = deltaVal !== undefined
          ? (deltaVal > 0 ? `+${Math.round(deltaVal)}` : `${Math.round(deltaVal)}`)
          : `${Math.round(vol)}`;

        if (radius >= 13 * hpr) {
          // Large bubble: Line 1 = Volume, Line 2 = Delta
          const volLabel = vol >= 1000 ? `${(vol / 1000).toFixed(1)}k` : `${Math.round(vol)}`;
          const fontSize1 = Math.max(7 * hpr, Math.round(radius * 0.36));
          const fontSize2 = Math.max(8 * hpr, Math.round(radius * 0.44));

          ctx.font = `bold ${fontSize1}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
          ctx.fillText(`${volLabel}v`, x, y - 1);

          ctx.font = `bold ${fontSize2}px sans-serif`;
          ctx.textBaseline = 'top';
          ctx.fillStyle = solidColor;
          ctx.fillText(`Δ${deltaStr}`, x, y + 1);
        } else if (radius >= 7 * hpr) {
          // Medium/normal bubble: Show Delta directly
          const fontSize = Math.max(7 * hpr, Math.round(radius * 0.52));
          ctx.font = `bold ${fontSize}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#FFFFFF';
          ctx.fillText(`Δ${deltaStr}`, x, y);
        }

        ctx.restore();
      });
    };

    if (typeof target.useBitmapCoordinateSpace === 'function') {
      target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: hpr, verticalPixelRatio: vpr }) => {
        drawBubbles(ctx, hpr, vpr);
      });
    } else if (typeof target.useMediaCoordinateSpace === 'function') {
      target.useMediaCoordinateSpace(({ context: ctx }) => {
        drawBubbles(ctx, 1, 1);
      });
    } else if (target.context) {
      drawBubbles(target.context, 1, 1);
    }
  }
}

// ─── Pane View ───────────────────────────────────────────────────────────────

class AbsorptionBubblesPaneView {
  constructor(source) {
    this._renderer = new AbsorptionBubblesRenderer(source);
  }

  // NOTE: In LWC v5, SeriesPrimitive only supports 'normal' or 'bottom'.
  // 'normal' renders after the main series view (i.e. on top of candlesticks).
  zOrder() {
    return 'normal';
  }

  renderer() {
    return this._renderer;
  }
}

// ─── Primitive ───────────────────────────────────────────────────────────────

class AbsorptionBubblesPrimitive {
  constructor() {
    this._bubbles = [];
    this._filter = 'ALL';
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
    this._paneViews = [new AbsorptionBubblesPaneView(this)];
  }

  // LWC calls this when primitive is attached to a series
  attached({ chart, series, requestUpdate }) {
    this._chart = chart;
    this._series = series;
    this._requestUpdate = requestUpdate;
    if (this._requestUpdate) this._requestUpdate();
  }

  // LWC calls this when primitive is detached
  detached() {
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
  }

  updateAllViews() {}

  // Returns the pane views — LWC extracts views where zOrder === 'normal'
  paneViews() {
    return this._paneViews;
  }

  // ── Public API ──────────────────────────────────────────────────────────

  setBubbles(bubbles, filter = 'ALL') {
    this._bubbles = bubbles || [];
    this._filter = filter;
    if (this._requestUpdate) this._requestUpdate();
  }

  setFilter(filter) {
    this._filter = filter;
    if (this._requestUpdate) this._requestUpdate();
  }
}

export { AbsorptionBubblesPrimitive };
