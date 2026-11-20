/**
 * VolumeProfilePrimitive — LWC v5 Series Primitive
 *
 * Renders a Volume Profile (VPVR-style) histogram on the right side of
 * the candlestick chart.  Each price bin is drawn as a horizontal bar:
 *   • POC bin       → bright yellow  (#FBBF24)
 *   • Value-area    → split green (buy) / red (sell)
 *   • Outside VA    → dimmed grey-blue
 *
 * POC, VAH, VAL dashed horizontal lines span the full chart width.
 *
 * Usage (in TradingViewChart.jsx):
 *   const prim = new VolumeProfilePrimitive();
 *   candleSeries.attachPrimitive(prim);
 *   prim.setData(orderFlow.volume_profile);
 */

export class VolumeProfilePrimitive {
  constructor() {
    this._vpData = null;      // { poc, vah, val, total_volume, bins[] }
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;

    // The single pane view returned to LWC
    this._paneView = new VolumeProfilePaneView(this);
  }

  // ── LWC v5 Primitive API ──────────────────────────────────────────────────

  attached({ chart, series, requestUpdate }) {
    this._chart = chart;
    this._series = series;
    this._requestUpdate = requestUpdate;
  }

  detached() {
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
  }

  updateAllViews() {
    this._paneView.update();
  }

  paneViews() {
    return [this._paneView];
  }

  // ── Public API ────────────────────────────────────────────────────────────

  setData(vpData) {
    this._vpData = vpData;
    if (this._requestUpdate) this._requestUpdate();
  }
}

// ─────────────────────────────────────────────────────────────────────────────

class VolumeProfilePaneView {
  constructor(primitive) {
    this._primitive = primitive;
    this._renderer = new VolumeProfileRenderer(primitive);
  }

  update() {
    // nothing to pre-compute — renderer reads live from primitive
  }

  zOrder() {
    return 'normal';
  }

  renderer() {
    return this._renderer;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

class VolumeProfileRenderer {
  constructor(primitive) {
    this._primitive = primitive;
  }

  draw(target) {
    const prim = this._primitive;
    if (!prim._vpData || !prim._chart || !prim._series) return;

    const { bins, poc, vah, val } = prim._vpData;
    if (!bins || bins.length === 0) return;

    target.useBitmapCoordinateSpace(({ context: ctx, bitmapSize, horizontalPixelRatio, verticalPixelRatio }) => {
      const W = bitmapSize.width;
      const H = bitmapSize.height;

      // Max bar width = 18% of canvas width
      const MAX_BAR_WIDTH = W * 0.18;
      const RIGHT_MARGIN = 4 * horizontalPixelRatio; // gap from right edge

      // Find max volume bin for scaling
      const maxVol = Math.max(...bins.map((b) => b.total_vol), 1);

      // Helper: price → y pixel (bitmap space)
      const toY = (price) => {
        const css = prim._series.priceToCoordinate(price);
        if (css === null || css === undefined) return null;
        return css * verticalPixelRatio;
      };

      // ── Draw horizontal bars ──
      bins.forEach((bin) => {
        const yTop = toY(bin.price_high);
        const yBot = toY(bin.price_low);
        if (yTop === null || yBot === null) return;

        const barH = Math.max(Math.abs(yBot - yTop), 1);
        const yStart = Math.min(yTop, yBot);
        const totalBarW = (bin.total_vol / maxVol) * MAX_BAR_WIDTH;
        const xStart = W - RIGHT_MARGIN - totalBarW;

        if (bin.is_poc) {
          // POC — full bar in bright yellow
          ctx.fillStyle = 'rgba(251, 191, 36, 0.85)';
          ctx.fillRect(xStart, yStart, totalBarW, barH);
        } else if (bin.in_value_area) {
          // Value area — split buy (green) | sell (red)
          const buyW = bin.total_vol > 0 ? (bin.buy_vol / bin.total_vol) * totalBarW : totalBarW / 2;
          const sellW = totalBarW - buyW;
          // green left half
          ctx.fillStyle = 'rgba(16, 185, 129, 0.60)';
          ctx.fillRect(xStart, yStart, buyW, barH);
          // red right half
          ctx.fillStyle = 'rgba(239, 68, 68, 0.60)';
          ctx.fillRect(xStart + buyW, yStart, sellW, barH);
        } else {
          // Outside value area — dimmed grey-blue
          ctx.fillStyle = 'rgba(100, 116, 139, 0.35)';
          ctx.fillRect(xStart, yStart, totalBarW, barH);
        }

        // Thin outline for readability
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(xStart, yStart, totalBarW, barH);
      });

      // ── Helper: draw dashed horizontal line across full width ──
      const drawDashedLine = (price, color, dashLen, gapLen, lineWidth) => {
        const y = toY(price);
        if (y === null) return;
        ctx.save();
        ctx.setLineDash([dashLen, gapLen]);
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth * verticalPixelRatio;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
        ctx.restore();
      };

      // POC line — yellow dashed
      if (poc !== undefined) drawDashedLine(poc, 'rgba(251, 191, 36, 0.80)', 8, 5, 1.2);
      // VAH line — green dashed
      if (vah !== undefined) drawDashedLine(vah, 'rgba(16, 185, 129, 0.65)', 6, 4, 0.9);
      // VAL line — red dashed
      if (val !== undefined) drawDashedLine(val, 'rgba(239, 68, 68, 0.65)', 6, 4, 0.9);

      // ── Labels on the right edge ──
      ctx.font = `bold ${10 * horizontalPixelRatio}px monospace`;
      ctx.textAlign = 'right';

      const drawLabel = (price, label, color) => {
        const y = toY(price);
        if (y === null) return;
        ctx.fillStyle = color;
        ctx.fillText(label, W - RIGHT_MARGIN - 2, y - 3 * verticalPixelRatio);
      };

      if (poc !== undefined) drawLabel(poc, `POC ${poc.toFixed(2)}`, 'rgba(251, 191, 36, 0.95)');
      if (vah !== undefined) drawLabel(vah, `VAH ${vah.toFixed(2)}`, 'rgba(16, 185, 129, 0.90)');
      if (val !== undefined) drawLabel(val, `VAL ${val.toFixed(2)}`, 'rgba(239, 68, 68, 0.90)');
    });
  }
}
