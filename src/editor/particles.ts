/**
 * Particle overlays (snow, confetti, hearts...). Every particle's path is a
 * function of time and its index, so preview, scrubbing and export agree.
 */

type Ctx = CanvasRenderingContext2D;

export const PARTICLE_TYPES = new Set(['snow', 'rain', 'confetti', 'hearts', 'sparkles', 'bokeh', 'fireworks', 'dust', 'light-rays', 'stars', 'bubbles', 'petals']);

/** Deterministic random in [0, 1) for particle i, channel k. */
const rnd = (i: number, k: number) => {
  const x = Math.sin(i * 127.1 + k * 311.7 + 74.7) * 43758.5453;
  return x - Math.floor(x);
};
const wrap = (v: number) => v - Math.floor(v);

function heart(ctx: Ctx, x: number, y: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.3);
  ctx.bezierCurveTo(x - s, y - s * 0.4, x - s * 0.4, y - s, x, y - s * 0.45);
  ctx.bezierCurveTo(x + s * 0.4, y - s, x + s, y - s * 0.4, x, y + s * 0.3);
  ctx.fill();
}

function star4(ctx: Ctx, x: number, y: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.quadraticCurveTo(x, y, x + s, y);
  ctx.quadraticCurveTo(x, y, x, y + s);
  ctx.quadraticCurveTo(x, y, x - s, y);
  ctx.quadraticCurveTo(x, y, x, y - s);
  ctx.fill();
}

const CONFETTI = ['#f43f5e', '#facc15', '#22c55e', '#3b82f6', '#a855f7', '#fb923c'];

/** Draws a particle effect over a W×H frame at time t (seconds). */
export function drawParticles(ctx: Ctx, type: string, t: number, W: number, H: number, intensity: number, speed: number, color: string) {
  const k = Math.max(0.05, Math.min(1, intensity));
  const s = t * (speed || 1);
  const unit = Math.min(W, H);
  ctx.save();
  switch (type) {
    case 'snow': {
      ctx.fillStyle = '#ffffff';
      const n = Math.round(40 + 160 * k);
      for (let i = 0; i < n; i++) {
        const z = 0.4 + rnd(i, 1) * 0.6;
        const y = wrap(rnd(i, 2) + s * 0.08 * z) * (H + 20) - 10;
        const x = wrap(rnd(i, 3) + Math.sin(s * 0.8 + i) * 0.02) * W;
        ctx.globalAlpha = 0.5 + 0.5 * z;
        ctx.beginPath();
        ctx.arc(x, y, unit * 0.004 * z * 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'rain': {
      ctx.strokeStyle = 'rgba(200,220,255,0.55)';
      ctx.lineWidth = Math.max(1, unit * 0.0025);
      const n = Math.round(60 + 200 * k);
      for (let i = 0; i < n; i++) {
        const z = 0.5 + rnd(i, 1) * 0.5;
        const y = wrap(rnd(i, 2) + s * 0.9 * z) * (H + 60) - 30;
        const x = wrap(rnd(i, 3) - s * 0.05) * W;
        const len = unit * 0.05 * z;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - len * 0.15, y + len);
        ctx.stroke();
      }
      ctx.fillStyle = `rgba(0,0,30,${0.15 * k})`;
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'confetti': {
      const n = Math.round(40 + 120 * k);
      for (let i = 0; i < n; i++) {
        const y = wrap(rnd(i, 2) + s * (0.12 + rnd(i, 4) * 0.1)) * (H + 40) - 20;
        const x = wrap(rnd(i, 3) + Math.sin(s * 1.5 + i) * 0.03) * W;
        ctx.fillStyle = CONFETTI[i % CONFETTI.length];
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(s * (2 + rnd(i, 5) * 4) + i);
        ctx.scale(1, Math.abs(Math.sin(s * 5 + i)) + 0.2);
        ctx.fillRect(-unit * 0.008, -unit * 0.004, unit * 0.016, unit * 0.008);
        ctx.restore();
      }
      break;
    }
    case 'hearts': {
      const n = Math.round(10 + 30 * k);
      for (let i = 0; i < n; i++) {
        const life = wrap(rnd(i, 2) + s * (0.08 + rnd(i, 4) * 0.06));
        const y = H * (1.05 - life * 1.2);
        const x = (rnd(i, 3) + Math.sin(s * 1.2 + i) * 0.04) * W;
        ctx.globalAlpha = Math.sin(life * Math.PI);
        ctx.fillStyle = i % 3 === 0 ? '#fb7185' : i % 3 === 1 ? '#f43f5e' : color || '#ec4899';
        heart(ctx, x, y, unit * (0.02 + rnd(i, 5) * 0.03));
      }
      break;
    }
    case 'sparkles': {
      const n = Math.round(20 + 60 * k);
      ctx.fillStyle = color || '#fff7cc';
      ctx.shadowColor = color || '#fde68a';
      ctx.shadowBlur = unit * 0.02;
      for (let i = 0; i < n; i++) {
        const phase = wrap(rnd(i, 1) + s * (0.4 + rnd(i, 4)));
        ctx.globalAlpha = Math.sin(phase * Math.PI);
        star4(ctx, rnd(i, 2) * W, rnd(i, 3) * H, unit * (0.006 + 0.016 * rnd(i, 5)) * Math.sin(phase * Math.PI));
      }
      break;
    }
    case 'bokeh': {
      ctx.globalCompositeOperation = 'screen';
      const n = Math.round(8 + 22 * k);
      for (let i = 0; i < n; i++) {
        const x = wrap(rnd(i, 2) + s * 0.01 * (rnd(i, 4) - 0.5)) * W;
        const y = wrap(rnd(i, 3) - s * 0.02 * rnd(i, 5)) * H;
        const r = unit * (0.03 + 0.07 * rnd(i, 1));
        const hue = Math.round(20 + 300 * rnd(i, 6));
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `hsla(${hue},90%,70%,${0.35 * k})`);
        g.addColorStop(0.7, `hsla(${hue},90%,60%,${0.2 * k})`);
        g.addColorStop(1, `hsla(${hue},90%,60%,0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'fireworks': {
      ctx.globalCompositeOperation = 'lighter';
      const bursts = Math.round(2 + 4 * k);
      for (let b = 0; b < bursts; b++) {
        const period = 1.6 + rnd(b, 1);
        const cycle = Math.floor((s + rnd(b, 2) * period) / period);
        const life = wrap((s + rnd(b, 2) * period) / period);
        const cx = (0.15 + 0.7 * rnd(b + cycle * 7, 3)) * W;
        const cy = (0.15 + 0.4 * rnd(b + cycle * 7, 4)) * H;
        const hue = Math.round(360 * rnd(b + cycle * 7, 5));
        const radius = unit * 0.25 * Math.sqrt(life);
        ctx.fillStyle = `hsla(${hue},100%,65%,${1 - life})`;
        for (let i = 0; i < 40; i++) {
          const a = (i / 40) * Math.PI * 2;
          const r = radius * (0.85 + 0.15 * rnd(i, b));
          ctx.beginPath();
          ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r + life * life * unit * 0.08, unit * 0.005, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case 'dust': {
      // Old film: specks, hairs and a scratch now and then.
      const frame = Math.floor(s * 24);
      ctx.fillStyle = 'rgba(20,15,10,0.7)';
      ctx.strokeStyle = 'rgba(20,15,10,0.5)';
      ctx.lineWidth = Math.max(1, unit * 0.002);
      const n = Math.round(4 + 16 * k);
      for (let i = 0; i < n; i++) {
        const x = rnd(frame * 31 + i, 1) * W;
        const y = rnd(frame * 31 + i, 2) * H;
        if (rnd(frame * 31 + i, 3) > 0.85) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(x + unit * 0.02, y + unit * 0.01, x + unit * 0.03 * rnd(i, 4), y + unit * 0.04);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(x, y, unit * 0.002 * (1 + 2 * rnd(frame + i, 5)), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (rnd(frame, 9) > 0.7) {
        const x = rnd(frame, 10) * W;
        ctx.strokeStyle = 'rgba(255,255,240,0.35)';
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + unit * 0.01, H);
        ctx.stroke();
      }
      break;
    }
    case 'light-rays': {
      ctx.globalCompositeOperation = 'screen';
      const ox = W * 0.15;
      const oy = -H * 0.1;
      const n = 7;
      for (let i = 0; i < n; i++) {
        const a = 0.35 + (i / n) * 0.9 + Math.sin(s * 0.4 + i) * 0.04;
        const w = 0.04 + 0.05 * rnd(i, 1);
        const len = Math.hypot(W, H) * 1.3;
        const g = ctx.createLinearGradient(ox, oy, ox + Math.cos(a) * len, oy + Math.sin(a) * len);
        g.addColorStop(0, `rgba(255,240,200,${0.35 * k * (0.6 + 0.4 * Math.sin(s + i))})`);
        g.addColorStop(1, 'rgba(255,240,200,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(ox + Math.cos(a - w) * len, oy + Math.sin(a - w) * len);
        ctx.lineTo(ox + Math.cos(a + w) * len, oy + Math.sin(a + w) * len);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'stars': {
      ctx.fillStyle = color || '#ffffff';
      const n = Math.round(30 + 100 * k);
      for (let i = 0; i < n; i++) {
        ctx.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(s * (1 + 2 * rnd(i, 4)) + i));
        star4(ctx, rnd(i, 2) * W, rnd(i, 3) * H * 0.75, unit * (0.003 + 0.008 * rnd(i, 5)));
      }
      break;
    }
    case 'bubbles': {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = Math.max(1, unit * 0.002);
      const n = Math.round(10 + 30 * k);
      for (let i = 0; i < n; i++) {
        const life = wrap(rnd(i, 2) + s * (0.06 + rnd(i, 4) * 0.06));
        const x = (rnd(i, 3) + Math.sin(s * 2 + i) * 0.02) * W;
        const y = H * (1.05 - life * 1.15);
        const r = unit * (0.01 + 0.03 * rnd(i, 5));
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'petals': {
      const n = Math.round(15 + 40 * k);
      for (let i = 0; i < n; i++) {
        const y = wrap(rnd(i, 2) + s * (0.07 + rnd(i, 4) * 0.05)) * (H + 40) - 20;
        const x = wrap(rnd(i, 3) + s * 0.04 + Math.sin(s + i) * 0.04) * W;
        ctx.fillStyle = i % 2 ? '#fbcfe8' : '#f9a8d4';
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(s * 1.5 + i);
        ctx.beginPath();
        ctx.ellipse(0, 0, unit * 0.014, unit * 0.007, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      break;
    }
  }
  ctx.restore();
}
