import { useRef, useState, useEffect } from 'react';
import { ComparativeDataset, ComparativeChartMode } from '@/types/pageElements';
import { ChartStyle } from '@/types/form';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

const tooltipStyle = {
  contentStyle: {
    backgroundColor: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    borderRadius: 12,
    fontSize: 12,
    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
    padding: '8px 12px',
  },
  labelStyle: { color: 'hsl(var(--foreground))', fontWeight: 600 },
};

interface Props {
  datasets: ComparativeDataset[];
  labels: string[];
  mode: ComparativeChartMode;
  style?: ChartStyle;
}

function buildCartesianData(datasets: ComparativeDataset[], labels: string[]) {
  return labels.map((label, i) => {
    const entry: Record<string, any> = { name: label };
    datasets.forEach(ds => {
      entry[ds.name] = parseFloat(ds.points[i]?.value || '0') || 0;
    });
    return entry;
  });
}

/** Badge gradient palettes per dataset index */
const BADGE_GRADIENTS = [
  ['#f59e0b', '#ef4444'],   // amber → red
  ['#22c55e', '#3b82f6'],   // green → blue
  ['#a855f7', '#ec4899'],   // purple → pink
  ['#06b6d4', '#f59e0b'],   // cyan → amber
  ['#ef4444', '#a855f7'],   // red → purple
];

function lerpColor(a: string, b: string, t: number): string {
  const parse = (hex: string) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const ca = parse(a), cb = parse(b);
  const r = Math.round(ca[0] + (cb[0] - ca[0]) * t);
  const g = Math.round(ca[1] + (cb[1] - ca[1]) * t);
  const bl = Math.round(ca[2] + (cb[2] - ca[2]) * t);
  return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
}

function CartesianView({ datasets, labels, style }: Omit<Props, 'mode'>) {
  const data = buildCartesianData(datasets, labels);
  const dur = style?.animated !== false ? 400 : 0;

  // Compute max value for Y axis
  const allValues = datasets.flatMap(ds => ds.points.map(p => parseFloat(p.value) || 0));
  const maxVal = Math.max(...allValues, 1);
  const niceMax = Math.ceil(maxVal / 25) * 25 || 100;

  // No longer need badgeIndex — badges are per-point via point.tooltip

  return (
    <div className="w-full min-w-0">
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 48, right: 44, left: 8, bottom: 8 }} style={{ overflow: 'visible' }}>
          <defs>
            <filter id="cmpBadgeShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000" floodOpacity="0.12" />
            </filter>
            {datasets.map((ds, di) => (
              <linearGradient key={`area-${ds.id}`} id={`cmp-area-${ds.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ds.color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={ds.color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          {style?.showGrid !== false && (
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
          )}
          <XAxis
            dataKey="name"
            tick={style?.showLabels !== false ? { fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontWeight: 500 } : false}
            axisLine={{ stroke: 'hsl(var(--border))' }}
            tickLine={false}
          />
          <YAxis
            tick={style?.showLabels !== false ? { fontSize: 9, fill: 'hsl(var(--muted-foreground))' } : false}
            axisLine={false}
            tickLine={false}
            width={24}
            domain={[0, niceMax]}
            ticks={Array.from({ length: 5 }, (_, i) => Math.round((niceMax / 4) * i))}
          />
          <Tooltip {...tooltipStyle} />
          {datasets.map((ds, di) => (
            <Area
              key={ds.id}
              type="monotone"
              dataKey={ds.name}
              stroke={ds.color}
              strokeWidth={3}
              fill={`url(#cmp-area-${ds.id})`}
              dot={(props: any) => {
                const { cx, cy, index } = props;
                const point = ds.points[index];
                const grad = BADGE_GRADIENTS[di % BADGE_GRADIENTS.length];
                const t = labels.length > 1 ? index / (labels.length - 1) : 0;
                const badgeColor = point?.tooltipColor || lerpColor(grad[0], grad[1], t);
                const tipText = point?.tooltip || '';
                const showBadge = !!tipText;
                const badgeW = Math.max(tipText.length * 6 + 14, 40);
                const badgeH = 22;

                return (
                  <g key={`${ds.id}-${index}`}>
                    {/* Outer glow */}
                    <circle cx={cx} cy={cy} r={6} fill={ds.color} opacity={0.15} />
                    {/* Dot */}
                    <circle cx={cx} cy={cy} r={4} fill={ds.color} stroke="white" strokeWidth={2} />
                    {/* Floating badge — shown on every point that has a tooltip */}
                    {showBadge && (() => {
                      const isFirst = index === 0;
                      const isLast = index === labels.length - 1;
                      const by = cy - badgeH - 10;
                      const bx = isFirst ? cx : isLast ? cx - badgeW : cx - badgeW / 2;
                      return (
                        <g>
                          <rect
                            x={bx} y={by} width={badgeW} height={badgeH}
                            rx={badgeH / 2} fill={badgeColor}
                            filter="url(#cmpBadgeShadow)"
                          />
                          <text
                            x={bx + badgeW / 2} y={by + badgeH / 2 + 1}
                            textAnchor="middle" dominantBaseline="middle"
                            fontSize={9} fontWeight={700} fill="white"
                          >
                            {tipText}
                          </text>
                        </g>
                      );
                    })()}
                  </g>
                );
              }}
              activeDot={{ r: 6, strokeWidth: 2, stroke: 'white', fill: ds.color }}
              animationDuration={dur}
              animationEasing="ease-out"
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function BarView({ datasets, labels, style }: Omit<Props, 'mode'>) {
  const data = buildCartesianData(datasets, labels);
  const dur = style?.animated !== false ? 400 : 0;

  return (
    <div className="w-full min-w-0">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 48, right: 44, left: -12, bottom: 8 }} style={{ overflow: 'visible' }}>
          <defs>
            <filter id="cmpBarBadgeShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000" floodOpacity="0.12" />
            </filter>
          </defs>
          {style?.showGrid !== false && (
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} opacity={0.5} />
          )}
          <XAxis
            dataKey="name"
            tick={style?.showLabels !== false ? { fontSize: 9, fill: 'hsl(var(--muted-foreground))' } : false}
            axisLine={false}
            tickLine={false}
          />
          <YAxis tick={false} axisLine={false} tickLine={false} width={0} />
          <Tooltip {...tooltipStyle} />
          {datasets.map((ds, di) => (
            <Bar
              key={ds.id}
              dataKey={ds.name}
              fill={ds.color}
              radius={[6, 6, 0, 0]}
              animationDuration={dur}
              animationEasing="ease-out"
              label={(props: any) => {
                const { x, y, width: bw, index } = props;
                const point = ds.points[index];
                const tipText = point?.tooltip || '';
                if (!tipText) return null;
                const grad = BADGE_GRADIENTS[di % BADGE_GRADIENTS.length];
                const t = labels.length > 1 ? index / (labels.length - 1) : 0;
                const badgeColor = point?.tooltipColor || lerpColor(grad[0], grad[1], t);
                const badgeW = Math.max(tipText.length * 6 + 14, 40);
                const badgeH = 22;
                const cx = x + bw / 2;
                return (() => {
                  const bx = cx - badgeW / 2;
                  const by = y - badgeH - 6;
                  return (
                    <g key={`bar-tip-${ds.id}-${index}`}>
                      <rect
                        x={bx} y={by} width={badgeW} height={badgeH}
                        rx={badgeH / 2} fill={badgeColor}
                        filter="url(#cmpBarBadgeShadow)"
                      />
                      <text
                        x={bx + badgeW / 2} y={by + badgeH / 2 + 1}
                        textAnchor="middle" dominantBaseline="middle"
                        fontSize={9} fontWeight={700} fill="white"
                      >
                        {tipText}
                      </text>
                    </g>
                  );
                })();
              }}
            />
          ))}
          {style?.showLegend && <Legend wrapperStyle={{ fontSize: 12 }} />}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const FALLBACK_COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#06b6d4', '#ec4899'];

function CircularView({ datasets, labels, style }: { datasets: ComparativeDataset[]; labels: string[]; style?: ChartStyle }) {
  const dur = style?.animated !== false ? 400 : 0;
  const maxPerRing = 100;
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 300, h: 320 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0) setDims({ w: width, h: 320 });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rings = datasets.map((ds, di) => {
    const points = ds.points.map((p, pi) => ({
      name: p.label || labels[pi] || `#${pi + 1}`,
      value: parseFloat(p.value) || 0,
      color: p.color || FALLBACK_COLORS[pi % FALLBACK_COLORS.length],
    }));
    const total = points.reduce((s, p) => s + p.value, 0);
    const cappedTotal = Math.min(total, maxPerRing);
    const remaining = Math.max(0, maxPerRing - cappedTotal);
    const data = [
      ...points.map(p => ({ ...p, value: Math.max(0, p.value) })),
      ...(remaining > 0 ? [{ name: 'remaining', value: remaining, color: '#d1d5db' }] : []),
    ];
    return { ds, data, di };
  });

  const isSmall = dims.w < 360;
  const outerBase = isSmall ? 80 : 115;
  const ringWidth = isSmall ? 20 : 28;
  const ringGap = isSmall ? 4 : 6;
  const chartH = isSmall ? 240 : 300;

  const cx = dims.w / 2;
  const cy = chartH / 2;

  // Pre-compute badge positions for HTML overlay — show ALL points with tooltips
  const badges = rings.flatMap((ring, ri) => {
    const outer = outerBase - ri * (ringWidth + ringGap);
    const totalVal = ring.data.reduce((s, d) => s + d.value, 0);

    return ring.ds.points
      .map((pt, pi) => {
        if (!pt.tooltip) return null;
        const tipText = pt.tooltip;
        let accum = 0;
        for (let i = 0; i < pi; i++) accum += ring.data[i].value;
        accum += ring.data[pi].value / 2;
        const fraction = accum / totalVal;
        const angleRad = (Math.PI / 2) - fraction * 2 * Math.PI;

        const edgePx = { x: cx + outer * Math.cos(angleRad), y: cy - outer * Math.sin(angleRad) };
        const badgeDist = outer + (isSmall ? 22 : 32);
        const rawBadgeX = cx + badgeDist * Math.cos(angleRad);
        const rawBadgeY = cy - badgeDist * Math.sin(angleRad);
        // Clamp badge within container bounds with padding
        const pad = 50;
        const badgePx = {
          x: Math.max(pad, Math.min(dims.w - pad, rawBadgeX)),
          y: Math.max(16, Math.min(chartH - 16, rawBadgeY)),
        };

        return { tipText, edgePx, badgePx, key: `${ring.ds.id}-${pi}` };
      })
      .filter(Boolean);
  });

  return (
    <div ref={containerRef} className="relative">
      <ResponsiveContainer width="100%" height={chartH}>
        <PieChart>
          {rings.map((ring, ri) => {
            const outer = outerBase - ri * (ringWidth + ringGap);
            const inner = outer - ringWidth;
            return (
              <Pie
                key={ring.ds.id}
                data={ring.data}
                cx="50%"
                cy="50%"
                outerRadius={outer}
                innerRadius={Math.max(inner, 10)}
                dataKey="value"
                animationDuration={dur}
                animationEasing="ease-out"
                strokeWidth={2}
                stroke="hsl(var(--card))"
                startAngle={90}
                endAngle={-270}
                paddingAngle={1}
                label={false}
                labelLine={false}
              >
                {ring.data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
            );
          })}
          <Tooltip {...tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>

      {/* Badge overlays */}
      {badges.map(b => {
        if (!b) return null;
        return (
          <svg
            key={`line-${b.key}`}
            className="absolute inset-0 pointer-events-none"
            width="100%"
            height={chartH}
            style={{ overflow: 'visible' }}
          >
            <line
              x1={b.edgePx.x} y1={b.edgePx.y}
              x2={b.badgePx.x} y2={b.badgePx.y}
              stroke="hsl(var(--foreground))"
              strokeWidth={1.5}
              opacity={0.45}
            />
          </svg>
        );
      })}
      {badges.map(b => {
        if (!b) return null;
        return (
          <div
            key={`badge-${b.key}`}
            className="absolute pointer-events-none"
            style={{
              left: b.badgePx.x,
              top: b.badgePx.y,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div style={{
              backgroundColor: '#374151',
              color: 'white',
              fontSize: isSmall ? 9 : 11,
              fontWeight: 700,
              padding: isSmall ? '3px 8px' : '4px 12px',
              borderRadius: 12,
              whiteSpace: 'nowrap',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            }}>
              {b.tipText}
            </div>
          </div>
        );
      })}

      {/* Centered legend */}
      <div className="flex flex-col gap-1.5 mt-1 px-1 items-center">
        {datasets.map((ds) => (
          <div key={ds.id} className="flex items-center gap-2 sm:gap-4 flex-wrap justify-center">
            {ds.points.map((pt, pi) => {
              const hasTip = !!pt.tooltip;
              const ptColor = pt.color || FALLBACK_COLORS[pi % FALLBACK_COLORS.length];
              return (
                <div
                  key={pt.id}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded-md"
                  style={hasTip ? { backgroundColor: `${ptColor}14` } : undefined}
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: ptColor }}
                  />
                  <span className="text-[10px] sm:text-xs text-muted-foreground">{labels[pi] || pt.label}</span>
                  <span className="text-[10px] sm:text-xs font-semibold">{pt.value}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ComparativeChartPreview({ datasets, labels, mode, style }: Props) {
  if (!datasets?.length) {
    return (
      <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
        Adicione conjuntos de dados para visualizar
      </div>
    );
  }

  switch (mode) {
    case 'bar':
      return <BarView datasets={datasets} labels={labels} style={style} />;
    case 'circular':
      return <CircularView datasets={datasets} labels={labels} style={style} />;
    case 'cartesian':
    default:
      return <CartesianView datasets={datasets} labels={labels} style={style} />;
  }
}
