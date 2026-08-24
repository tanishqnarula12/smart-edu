import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import { CHART_COLORS, SEMANTIC_COLORS, RISK_COLORS } from '../utils/constants.js';

/**
 * Chart wrappers (§15, §54).
 *
 * Recharts is configured once here — axes, grid, tooltip and legend all pick
 * up the theme tokens — so individual dashboards pass data and nothing else.
 * Every chart sits in a ResponsiveContainer, which is what makes the layouts
 * work down to 320px.
 */

const AXIS_PROPS = {
  stroke: 'currentColor',
  tick: { fontSize: 11 },
  tickLine: false,
  axisLine: false,
  className: 'text-ink-subtle',
};

/** Shared tooltip so every chart reads the same. */
function ChartTooltip({ active, payload, label, valueSuffix = '', labelFormatter }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-xl border border-line bg-surface-raised p-3 shadow-popover">
      {label !== undefined && (
        <p className="mb-1.5 text-xs font-semibold text-ink">
          {labelFormatter ? labelFormatter(label) : label}
        </p>
      )}
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={entry.dataKey ?? entry.name} className="flex items-center gap-2 text-xs">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: entry.color ?? entry.fill }}
              aria-hidden="true"
            />
            <span className="text-ink-muted">{entry.name}</span>
            <span className="ml-auto font-semibold tabular-nums text-ink">
              {typeof entry.value === 'number' ? entry.value.toFixed(entry.value % 1 === 0 ? 0 : 1) : entry.value}
              {valueSuffix}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const legendProps = {
  wrapperStyle: { fontSize: 12, paddingTop: 8 },
  iconType: 'circle',
  iconSize: 8,
};

/** Attendance / CGPA trend over time. */
export function TrendChart({
  data,
  xKey = 'label',
  series = [{ key: 'percentage', name: 'Attendance', color: CHART_COLORS[0] }],
  height = 260,
  valueSuffix = '%',
  domain = [0, 100],
  referenceValue,
  referenceLabel,
  showLegend = false,
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          {series.map((entry) => (
            <linearGradient key={entry.key} id={`gradient-${entry.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={entry.color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={entry.color} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>

        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={xKey} {...AXIS_PROPS} />
        <YAxis domain={domain} {...AXIS_PROPS} width={44} />
        <Tooltip content={<ChartTooltip valueSuffix={valueSuffix} />} cursor={{ strokeDasharray: '3 3' }} />
        {showLegend && <Legend {...legendProps} />}

        {referenceValue !== undefined && (
          <ReferenceLine
            y={referenceValue}
            stroke={SEMANTIC_COLORS.warning}
            strokeDasharray="4 4"
            label={{
              value: referenceLabel ?? `${referenceValue}%`,
              position: 'right',
              fontSize: 10,
              fill: SEMANTIC_COLORS.warning,
            }}
          />
        )}

        {series.map((entry) => (
          <Area
            key={entry.key}
            type="monotone"
            dataKey={entry.key}
            name={entry.name}
            stroke={entry.color}
            strokeWidth={2}
            fill={`url(#gradient-${entry.key})`}
            dot={{ r: 3, strokeWidth: 2, fill: 'white' }}
            activeDot={{ r: 5 }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Subject-wise comparison. Horizontal layout keeps long labels readable. */
export function ComparisonBarChart({
  data,
  xKey = 'name',
  series = [{ key: 'value', name: 'Score', color: CHART_COLORS[0] }],
  height = 280,
  layout = 'horizontal',
  valueSuffix = '%',
  domain = [0, 100],
  referenceValue,
  showLegend = false,
}) {
  const isVertical = layout === 'vertical';

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout={layout}
        margin={
          isVertical
            ? { top: 4, right: 20, left: 8, bottom: 4 }
            : { top: 8, right: 8, left: -18, bottom: 4 }
        }
        barCategoryGap={isVertical ? '22%' : '28%'}
      >
        <CartesianGrid strokeDasharray="3 3" horizontal={!isVertical} vertical={isVertical} />

        {isVertical ? (
          <>
            <XAxis type="number" domain={domain} {...AXIS_PROPS} />
            <YAxis type="category" dataKey={xKey} width={110} {...AXIS_PROPS} />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} {...AXIS_PROPS} interval={0} angle={-12} textAnchor="end" height={52} />
            <YAxis domain={domain} width={44} {...AXIS_PROPS} />
          </>
        )}

        <Tooltip content={<ChartTooltip valueSuffix={valueSuffix} />} cursor={{ fill: 'rgb(148 163 184 / 0.08)' }} />
        {showLegend && <Legend {...legendProps} />}

        {referenceValue !== undefined &&
          (isVertical ? (
            <ReferenceLine x={referenceValue} stroke={SEMANTIC_COLORS.warning} strokeDasharray="4 4" />
          ) : (
            <ReferenceLine y={referenceValue} stroke={SEMANTIC_COLORS.warning} strokeDasharray="4 4" />
          ))}

        {series.map((entry, index) => (
          <Bar
            key={entry.key}
            dataKey={entry.key}
            name={entry.name}
            fill={entry.color ?? CHART_COLORS[index % CHART_COLORS.length]}
            radius={isVertical ? [0, 6, 6, 0] : [6, 6, 0, 0]}
            maxBarSize={isVertical ? 22 : 44}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Risk distribution / assignment status — a donut with a centred total. */
export function DonutChart({
  data,
  nameKey = 'name',
  valueKey = 'value',
  height = 240,
  colors = CHART_COLORS,
  centerLabel,
  centerValue,
  showLegend = true,
}) {
  const total = data?.reduce((sum, entry) => sum + Number(entry[valueKey] || 0), 0) ?? 0;

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            dataKey={valueKey}
            nameKey={nameKey}
            cx="50%"
            cy="50%"
            innerRadius="58%"
            outerRadius="82%"
            paddingAngle={2}
            strokeWidth={0}
          >
            {data?.map((entry, index) => (
              <Cell key={entry[nameKey]} fill={entry.color ?? colors[index % colors.length]} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip />} />
          {showLegend && <Legend {...legendProps} verticalAlign="bottom" />}
        </PieChart>
      </ResponsiveContainer>

      {(centerValue !== undefined || total > 0) && (
        <div
          className="pointer-events-none absolute inset-x-0 flex flex-col items-center justify-center"
          style={{ top: 0, height: showLegend ? height - 36 : height }}
        >
          <span className="text-2xl font-bold text-ink">{centerValue ?? total}</span>
          {centerLabel && <span className="text-xs text-ink-muted">{centerLabel}</span>}
        </div>
      )}
    </div>
  );
}

/** Risk bands, coloured by severity rather than by index. */
export function RiskDonut({ distribution, height = 240 }) {
  const data = [
    { name: 'Low risk', value: distribution?.low ?? 0, color: RISK_COLORS.low },
    { name: 'Medium risk', value: distribution?.medium ?? 0, color: RISK_COLORS.medium },
    { name: 'High risk', value: distribution?.high ?? 0, color: RISK_COLORS.high },
  ].filter((entry) => entry.value > 0);

  return <DonutChart data={data} height={height} centerLabel="students" />;
}

/** Multi-subject profile — good for showing a spread at a glance. */
export function SubjectRadar({ data, height = 280, dataKey = 'value', nameKey = 'subject' }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid className="stroke-line" />
        <PolarAngleAxis dataKey={nameKey} tick={{ fontSize: 11 }} className="fill-ink-muted" />
        <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} className="fill-ink-subtle" />
        <Tooltip content={<ChartTooltip valueSuffix="%" />} />
        <Radar
          name="Score"
          dataKey={dataKey}
          stroke={CHART_COLORS[0]}
          fill={CHART_COLORS[0]}
          fillOpacity={0.25}
          strokeWidth={2}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

/** Plain line chart, for comparing two series without the filled area. */
export function MultiLineChart({
  data,
  xKey = 'label',
  series = [],
  height = 280,
  valueSuffix = '%',
  domain = [0, 100],
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={xKey} {...AXIS_PROPS} />
        <YAxis domain={domain} width={44} {...AXIS_PROPS} />
        <Tooltip content={<ChartTooltip valueSuffix={valueSuffix} />} />
        <Legend {...legendProps} />

        {series.map((entry, index) => (
          <Line
            key={entry.key}
            type="monotone"
            dataKey={entry.key}
            name={entry.name}
            stroke={entry.color ?? CHART_COLORS[index % CHART_COLORS.length]}
            strokeWidth={2}
            strokeDasharray={entry.dashed ? '5 4' : undefined}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Compact inline trend, for table rows and small tiles. */
export function Sparkline({ data, dataKey = 'value', color = CHART_COLORS[0], height = 40 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 2, left: 2, bottom: 4 }}>
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default TrendChart;
