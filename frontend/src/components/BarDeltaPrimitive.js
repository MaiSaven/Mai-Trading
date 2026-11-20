/**
 * BarDeltaPrimitive — LWC v5 Series Primitive
 *
 * Renders the Net Order Flow Delta number directly below (or above)
 * each historical candlestick on the main chart (Footprint style).
 *
 * e.g. +185 in emerald green, -240 in coral red.
 */

class BarDeltaRenderer {
  constructor(source) {
    this._source = source;
  }

  draw(target) {
    const { _chart: chart, _series: series, _deltaMap: deltaMap, _candles: candles } = this._source;
    if (!chart || !series || !deltaMap || deltaMap.size === 0 || !candles || candles.length === 0) return;

    const timeScale = chart.timeScale();

    const drawDeltas = (ctx, hpr = 1, vpr = 1) => {
      candles.forEach((c) => {
        const deltaInfo = deltaMap.get(c.time);
        if (!deltaInfo || deltaInfo.delta === undefined) return;

        const rawX = timeScale.timeToCoordinate(c.time);
        const rawY = series.priceToCoordinate(c.low);
        if (rawX === null || rawX === undefined || rawY === null || rawY === undefined) return;

        const x = Math.round(rawX * hpr);
        const y = Math.round((rawY + 14) * vpr); // 14px below the candle low wick

        const delta = Math.round(deltaInfo.delta);
        const isPos = delta >= 0;
        const color = isPos ? '#10B981' : '#EF4444';
        const label = isPos ? `+${delta}` : `${delta}`;

        ctx.save();
        ctx.font = `bold ${Math.round(9 * hpr)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        // Subdued background pill for maximum contrast over grid
        const textWidth = ctx.measureText(label).width;
        const padX = 3 * hpr;
        const padY = 2 * vpr;
        ctx.fillStyle = isPos ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)';
        ctx.fillRect(
          x - textWidth / 2 - padX,
          y - padY,
          textWidth + padX * 2,
          10 * vpr + padY * 2
        );

        // Text
        ctx.fillStyle = color;
        ctx.fillText(label, x, y);
        ctx.restore();
      });
    };

    if (typeof target.useBitmapCoordinateSpace === 'function') {
      target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: hpr, verticalPixelRatio: vpr }) => {
        drawDeltas(ctx, hpr, vpr);
      });
    } else if (typeof target.useMediaCoordinateSpace === 'function') {
      target.useMediaCoordinateSpace(({ context: ctx }) => {
        drawDeltas(ctx, 1, 1);
      });
    } else if (target.context) {
      drawDeltas(target.context, 1, 1);
    }
  }
}

class BarDeltaPaneView {
  constructor(source) {
    this._renderer = new BarDeltaRenderer(source);
  }

  zOrder() {
    return 'normal';
  }

  renderer() {
    return this._renderer;
  }
}

class BarDeltaPrimitive {
  constructor() {
    this._deltaMap = new Map();
    this._candles = [];
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
    this._paneViews = [new BarDeltaPaneView(this)];
  }

  attached({ chart, series, requestUpdate }) {
    this._chart = chart;
    this._series = series;
    this._requestUpdate = requestUpdate;
    if (this._requestUpdate) this._requestUpdate();
  }

  detached() {
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
  }

  updateAllViews() {}

  paneViews() {
    return this._paneViews;
  }

  setData(deltaMap, candles) {
    this._deltaMap = deltaMap || new Map();
    this._candles = candles || [];
    if (this._requestUpdate) this._requestUpdate();
  }
}

export { BarDeltaPrimitive };
