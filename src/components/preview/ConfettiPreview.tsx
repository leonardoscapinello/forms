import { useEffect, useRef, useCallback } from 'react';

export type ConfettiDirection = 'top' | 'sides';
export type ConfettiIntensity = 'subtle' | 'explosion';

interface Props {
  direction?: ConfettiDirection;
  intensity?: ConfettiIntensity;
  /** Primary colors for confetti pieces */
  colors?: string[];
  /** Duration in ms before stopping emission (particles still fall). 0 = one burst */
  duration?: number;
  /** Whether this is an editor preview (smaller, looping) */
  editorPreview?: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  color: string;
  rotation: number;
  spin: number;
  flipPhase: number;
  flipSpeed: number;
  opacity: number;
  age: number;
  maxLife: number;
  air: number;
}

const DEFAULT_COLORS = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#A78BFA', '#F97316', '#06B6D4', '#EC4899'];
const GRAVITY = 0.11;

function createParticles(
  count: number,
  canvasW: number,
  canvasH: number,
  direction: ConfettiDirection,
  intensity: ConfettiIntensity,
  usedColors: string[],
): Particle[] {
  const particles: Particle[] = [];
  const isExplosion = intensity === 'explosion';

  for (let i = 0; i < count; i++) {
    let x = 0;
    let y = 0;
    let vx = 0;
    let vy = 0;

    if (direction === 'sides') {
      const fromLeft = Math.random() > 0.5;
      x = fromLeft ? -16 : canvasW + 16;
      y = canvasH * (0.18 + Math.random() * 0.36);

      const horizontal = isExplosion ? 3.8 + Math.random() * 2.2 : 1.8 + Math.random() * 1.6;
      vx = (fromLeft ? 1 : -1) * horizontal;
      vy = (Math.random() - 0.65) * (isExplosion ? 2.4 : 1.2); // leve subida inicial, sem sumir da tela
    } else {
      // Chuva realista de cima
      x = Math.random() * canvasW;
      y = -20 - Math.random() * 80;
      vx = (Math.random() - 0.5) * (isExplosion ? 3.2 : 1.5);
      vy = isExplosion ? 1.6 + Math.random() * 2.8 : 0.8 + Math.random() * 1.4;
    }

    const w = 3 + Math.random() * 4;
    const h = 5 + Math.random() * 7;

    particles.push({
      x,
      y,
      vx,
      vy,
      w,
      h,
      color: usedColors[Math.floor(Math.random() * usedColors.length)],
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.14,
      flipPhase: Math.random() * Math.PI * 2,
      flipSpeed: 0.08 + Math.random() * 0.12,
      opacity: 0.9 + Math.random() * 0.1,
      age: 0,
      maxLife: (isExplosion ? 3400 : 4200) + Math.random() * 1200,
      air: 0.006 + Math.random() * 0.012,
    });
  }

  return particles;
}

export default function ConfettiPreview({
  direction = 'top',
  intensity = 'explosion',
  colors,
  duration = 3000,
  editorPreview = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const startRef = useRef(0);
  const sizeRef = useRef({ width: 0, height: 0 });

  const usedColors = colors?.length ? colors : DEFAULT_COLORS;

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(window.innerWidth || rect.width || 1));
    const height = Math.max(1, Math.round(window.innerHeight || rect.height || 1));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    sizeRef.current = { width, height };
  }, []);

  const init = useCallback(() => {
    resizeCanvas();

    const { width, height } = sizeRef.current;
    if (!width || !height) return;

    const count = editorPreview
      ? (intensity === 'explosion' ? 36 : 20)
      : (intensity === 'explosion' ? 100 : 52);

    particlesRef.current = createParticles(count, width, height, direction, intensity, usedColors);
    startRef.current = performance.now();
  }, [direction, intensity, usedColors, editorPreview, resizeCanvas]);

  useEffect(() => {
    init();

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let running = true;
    let lastTime = performance.now();

    const animate = (now: number) => {
      if (!running) return;

      const dt = Math.min((now - lastTime) / 16.667, 2);
      lastTime = now;
      const elapsed = now - startRef.current;
      const { width, height } = sizeRef.current;

      ctx.clearRect(0, 0, width, height);

      const alive: Particle[] = [];
      for (const p of particlesRef.current) {
        // Gravidade + arrasto aerodinâmico proporcional à velocidade
        const speed = Math.hypot(p.vx, p.vy);
        if (speed > 0.001) {
          const drag = p.air * speed;
          p.vx -= (p.vx / speed) * drag * dt;
          p.vy -= (p.vy / speed) * drag * dt;
        }
        p.vy += GRAVITY * dt;

        // Flutter/tumbling para realismo
        p.flipPhase += p.flipSpeed * dt;
        p.rotation += p.spin * dt;

        const flutterX = Math.sin(p.flipPhase) * 0.18;
        p.x += (p.vx + flutterX) * dt;
        p.y += p.vy * dt;

        p.age += 16.667 * dt;

        const fadeStart = Math.min(duration, p.maxLife) * 0.72;
        if (p.age > fadeStart) {
          const fadeProgress = (p.age - fadeStart) / Math.max(1, (Math.min(duration, p.maxLife) - fadeStart));
          p.opacity = Math.max(0, 1 - fadeProgress);
        }

        if (
          p.opacity <= 0.01 ||
          p.age >= p.maxLife ||
          p.y > height + 80 ||
          p.x < -120 ||
          p.x > width + 120
        ) {
          continue;
        }

        const flipScale = 0.25 + Math.abs(Math.sin(p.flipPhase)) * 0.85;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = p.opacity * (0.65 + 0.35 * flipScale);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -(p.h * flipScale) / 2, p.w, p.h * flipScale);
        ctx.restore();

        alive.push(p);
      }

      particlesRef.current = alive;

      if (alive.length === 0 || elapsed >= duration + 1600) {
        if (editorPreview && running) {
          setTimeout(() => {
            if (!running) return;
            init();
            rafRef.current = requestAnimationFrame(animate);
          }, 900);
        }
        return;
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    const onResize = () => resizeCanvas();
    window.addEventListener('resize', onResize);

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      running = false;
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(rafRef.current);
      // Clear canvas immediately so it doesn't freeze as a static frame
      const cvs = canvasRef.current;
      if (cvs) {
        const c = cvs.getContext('2d');
        if (c) c.clearRect(0, 0, cvs.width, cvs.height);
      }
    };
  }, [init, duration, editorPreview, resizeCanvas]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 50 }}
    />
  );
}
