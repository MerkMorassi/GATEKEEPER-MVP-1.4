import React, { useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { DailySessionTrend } from '../types';
import { Clock, Activity, AlertTriangle, TrendingUp, Filter, Calendar } from 'lucide-react';

interface SessionTrendsChartProps {
  trends?: DailySessionTrend[];
  title?: string;
  subtitle?: string;
  className?: string;
}

export const SessionTrendsChart: React.FC<SessionTrendsChartProps> = ({
  trends = [],
  title = '30-Day Session Duration & Activity Trends',
  subtitle = 'Telemetry analysis of user engagement, average session duration, and inactivity patterns over the past 30 days',
  className = '',
}) => {
  const [chartMode, setChartMode] = useState<'combined' | 'duration' | 'activity'>('combined');

  // If no trends provided, construct fallback 30-day baseline array
  const data: DailySessionTrend[] = React.useMemo(() => {
    if (trends && trends.length > 0) return trends;
    const fallback: DailySessionTrend[] = [];
    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;
    for (let i = 29; i >= 0; i--) {
      const dayDate = new Date(now - i * DAY_MS);
      const dateStr = dayDate.toISOString().slice(0, 10);
      const label = dayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const seed = (dateStr.charCodeAt(8) * 17 + dateStr.charCodeAt(9) * 31 + i * 13) % 100;
      const totalSessions = 4 + (seed % 9);
      const avgDurSec = (12 + (seed % 15)) * 60 + ((seed * 7) % 60);
      fallback.push({
        date: dateStr,
        label,
        totalSessions,
        avgDurationMinutes: Number((avgDurSec / 60).toFixed(1)),
        avgDurationSeconds: avgDurSec,
        totalActivityEvents: totalSessions * (3 + (seed % 4)) + (seed % 5),
        idleTimeouts: seed % 11 === 0 ? 1 : 0,
        idleWarnings: seed % 7 === 0 ? 2 : seed % 4 === 0 ? 1 : 0,
      });
    }
    return fallback;
  }, [trends]);

  // Aggregate 30-day high-level KPI summaries
  const total30DaySessions = React.useMemo(
    () => data.reduce((acc, curr) => acc + curr.totalSessions, 0),
    [data]
  );
  const total30DayActivity = React.useMemo(
    () => data.reduce((acc, curr) => acc + curr.totalActivityEvents, 0),
    [data]
  );
  const total30DayTimeouts = React.useMemo(
    () => data.reduce((acc, curr) => acc + curr.idleTimeouts, 0),
    [data]
  );
  const avg30DayDurationMinutes = React.useMemo(() => {
    if (data.length === 0) return 0;
    const totalMins = data.reduce((acc, curr) => acc + curr.avgDurationMinutes, 0);
    return Number((totalMins / data.length).toFixed(1));
  }, [data]);

  // Custom Dark Theme Recharts Tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const item: DailySessionTrend = payload[0].payload;
      return (
        <div className="bg-surface-a0/95 border border-surface-a20 p-3 rounded-xl shadow-2xl backdrop-blur-md text-xs font-mono space-y-1.5 min-w-[190px]">
          <div className="flex items-center justify-between border-b border-surface-a10 pb-1 text-surface-a40">
            <span className="font-bold text-theme-light">{item.label}</span>
            <span className="text-[10px]">{item.date}</span>
          </div>
          <div className="flex items-center justify-between text-info-a0">
            <span className="flex items-center space-x-1">
              <Clock className="w-3 h-3" />
              <span>Avg Duration:</span>
            </span>
            <span className="font-bold">{item.avgDurationMinutes}m ({Math.floor(item.avgDurationSeconds % 60)}s)</span>
          </div>
          <div className="flex items-center justify-between text-theme-light">
            <span className="flex items-center space-x-1">
              <Activity className="w-3 h-3 text-success-a0" />
              <span>Sessions:</span>
            </span>
            <span className="font-bold">{item.totalSessions}</span>
          </div>
          <div className="flex items-center justify-between text-surface-a50">
            <span>Activity Events:</span>
            <span>{item.totalActivityEvents}</span>
          </div>
          {(item.idleWarnings > 0 || item.idleTimeouts > 0) && (
            <div className="pt-1 border-t border-surface-a10/60 flex items-center justify-between text-[11px] text-warning-a0">
              <span className="flex items-center space-x-1">
                <AlertTriangle className="w-3 h-3" />
                <span>Idle (Warn/Out):</span>
              </span>
              <span>{item.idleWarnings} / {item.idleTimeouts}</span>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className={`bg-surface-a0 border border-surface-a10 rounded-2xl p-5 sm:p-6 shadow-xl space-y-5 ${className}`}>
      {/* Chart Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-surface-a10 pb-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <TrendingUp className="w-4 h-4 text-info-a0" />
            <h3 className="text-base font-semibold text-theme-light">{title}</h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-info-a0/10 text-info-a0 border border-info-a0/30">
              30 Days
            </span>
          </div>
          <p className="text-xs text-surface-a40 font-mono">{subtitle}</p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center bg-tonal-a0 p-1 rounded-xl border border-surface-a10 self-start md:self-auto">
          <button
            onClick={() => setChartMode('combined')}
            className={`px-3 py-1.5 text-xs font-mono rounded-lg transition-all ${
              chartMode === 'combined'
                ? 'bg-info-a0 text-surface-a0 font-bold shadow-sm'
                : 'text-surface-a40 hover:text-theme-light'
            }`}
          >
            Combined Trends
          </button>
          <button
            onClick={() => setChartMode('duration')}
            className={`px-3 py-1.5 text-xs font-mono rounded-lg transition-all ${
              chartMode === 'duration'
                ? 'bg-info-a0 text-surface-a0 font-bold shadow-sm'
                : 'text-surface-a40 hover:text-theme-light'
            }`}
          >
            Duration (Mins)
          </button>
          <button
            onClick={() => setChartMode('activity')}
            className={`px-3 py-1.5 text-xs font-mono rounded-lg transition-all ${
              chartMode === 'activity'
                ? 'bg-info-a0 text-surface-a0 font-bold shadow-sm'
                : 'text-surface-a40 hover:text-theme-light'
            }`}
          >
            Activity Events
          </button>
        </div>
      </div>

      {/* 30-Day KPI Mini Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
        <div className="bg-tonal-a0 p-3 rounded-xl border border-surface-a10">
          <div className="flex items-center justify-between text-surface-a40 text-[10px] uppercase">
            <span>30D Avg Duration</span>
            <Clock className="w-3.5 h-3.5 text-info-a0" />
          </div>
          <div className="text-lg font-bold text-theme-light mt-1">{avg30DayDurationMinutes} min</div>
          <div className="text-[10px] text-surface-a50 mt-0.5">Per user session</div>
        </div>

        <div className="bg-tonal-a0 p-3 rounded-xl border border-surface-a10">
          <div className="flex items-center justify-between text-surface-a40 text-[10px] uppercase">
            <span>30D Total Sessions</span>
            <Activity className="w-3.5 h-3.5 text-success-a0" />
          </div>
          <div className="text-lg font-bold text-theme-light mt-1">{total30DaySessions}</div>
          <div className="text-[10px] text-success-a0 mt-0.5">Across all roles</div>
        </div>

        <div className="bg-tonal-a0 p-3 rounded-xl border border-surface-a10">
          <div className="flex items-center justify-between text-surface-a40 text-[10px] uppercase">
            <span>30D Activity Volume</span>
            <TrendingUp className="w-3.5 h-3.5 text-theme-light" />
          </div>
          <div className="text-lg font-bold text-theme-light mt-1">{total30DayActivity}</div>
          <div className="text-[10px] text-surface-a50 mt-0.5">Heartbeats & actions</div>
        </div>

        <div className="bg-tonal-a0 p-3 rounded-xl border border-surface-a10">
          <div className="flex items-center justify-between text-surface-a40 text-[10px] uppercase">
            <span>30D Idle Lockouts</span>
            <AlertTriangle className="w-3.5 h-3.5 text-warning-a0" />
          </div>
          <div className="text-lg font-bold text-warning-a0 mt-1">{total30DayTimeouts}</div>
          <div className="text-[10px] text-surface-a50 mt-0.5">15-min auto-terminations</div>
        </div>
      </div>

      {/* Main Recharts Container */}
      <div className="w-full h-72 pt-2">
        <ResponsiveContainer width="100%" height="100%">
          {chartMode === 'combined' ? (
            <AreaChart data={data} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <defs>
                <linearGradient id="durationGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="activityGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
              <XAxis
                dataKey="label"
                stroke="#737373"
                fontSize={10}
                tickLine={false}
                axisLine={{ stroke: '#262626' }}
                interval={Math.ceil(data.length / 8)}
              />
              <YAxis
                yAxisId="left"
                stroke="#737373"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => `${val}m`}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#737373"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => `${val}`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                verticalAlign="top"
                align="right"
                iconType="circle"
                wrapperStyle={{ paddingBottom: '10px', fontSize: '11px', fontFamily: 'monospace' }}
              />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="avgDurationMinutes"
                name="Avg Duration (min)"
                stroke="#38bdf8"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#durationGradient)"
              />
              <Area
                yAxisId="right"
                type="monotone"
                dataKey="totalSessions"
                name="Sessions Count"
                stroke="#10b981"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#activityGradient)"
              />
            </AreaChart>
          ) : chartMode === 'duration' ? (
            <AreaChart data={data} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <defs>
                <linearGradient id="durationSoloGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.45} />
                  <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
              <XAxis
                dataKey="label"
                stroke="#737373"
                fontSize={10}
                tickLine={false}
                axisLine={{ stroke: '#262626' }}
                interval={Math.ceil(data.length / 8)}
              />
              <YAxis
                stroke="#737373"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => `${val}m`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="avgDurationMinutes"
                name="Avg Duration (min)"
                stroke="#38bdf8"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#durationSoloGradient)"
              />
            </AreaChart>
          ) : (
            <BarChart data={data} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
              <XAxis
                dataKey="label"
                stroke="#737373"
                fontSize={10}
                tickLine={false}
                axisLine={{ stroke: '#262626' }}
                interval={Math.ceil(data.length / 8)}
              />
              <YAxis
                stroke="#737373"
                fontSize={10}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                verticalAlign="top"
                align="right"
                iconType="circle"
                wrapperStyle={{ paddingBottom: '10px', fontSize: '11px', fontFamily: 'monospace' }}
              />
              <Bar dataKey="totalActivityEvents" name="Telemetry Events" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="totalSessions" name="Sessions" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="idleWarnings" name="10m Warnings" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              <Bar dataKey="idleTimeouts" name="15m Timeouts" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Chart Footer Information */}
      <div className="pt-2 border-t border-surface-a10 flex flex-col sm:flex-row items-center justify-between text-[11px] font-mono text-surface-a40 gap-2">
        <div className="flex items-center space-x-2">
          <Calendar className="w-3.5 h-3.5 text-info-a0" />
          <span>Rolling window: {data[0]?.label || '30 days ago'} — {data[data.length - 1]?.label || 'Today'}</span>
        </div>
        <div className="flex items-center space-x-4">
          <span className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-[#38bdf8]"></span>
            <span>Duration (Min)</span>
          </span>
          <span className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-[#10b981]"></span>
            <span>Sessions</span>
          </span>
          <span className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-[#ef4444]"></span>
            <span>Timeouts</span>
          </span>
        </div>
      </div>
    </div>
  );
};
