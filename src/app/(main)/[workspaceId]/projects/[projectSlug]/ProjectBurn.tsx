"use client";

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { ProjectBurn as BurnData } from '@/lib/project-burn';

const dayMs = 86_400_000;
const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const date = (day: number) => dateFormat.format(day * dayMs);
const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 });
const cardStyle = 'min-w-0 rounded-[10px] border-white/[.09] bg-[#171719] p-3';
const muted = 'text-[13px] text-[#9c9ca1]';
const agents = '#a78bfa';
const people = '#60a5fa';
const unknown = '#75757a';
const scope = '#9c9ca1';
const done = '#34d399';
const grid = 'rgba(255,255,255,.09)';
const axis = { fill: '#9c9ca1', fontSize: 11 };
const width = 500;
const height = 230;
const left = 40;
const right = 16;
const top = 24;
const bottom = height - 24;

function Legend({ entries, dots = false }: { entries: [string, string][]; dots?: boolean }) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#9c9ca1]">
      {entries.map(([label, color]) => (
        <span key={label} className="inline-flex items-center gap-[5px]">
          <span aria-hidden="true" className={dots ? 'size-2 rounded-full' : 'h-2 w-3.5 rounded-sm'} style={{ backgroundColor: color }} />
          {label}
        </span>
      ))}
    </div>
  );
}

function Toggle<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: [T, string][]; onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-[9px] border border-white/[.09]">
      {options.map(([option, text]) => (
        <button key={option} type="button" onClick={() => onChange(option)} aria-pressed={value === option}
          className={cn('rounded-lg px-3 py-1.5 text-[13px]', value === option ? 'bg-blue-500 text-white' : 'text-[#9c9ca1] hover:text-white')}>
          {text}
        </button>
      ))}
    </div>
  );
}

function chartScale(maximum: number, plotWidth = width) {
  const target = Math.max(1, maximum / 4);
  const power = 10 ** Math.floor(Math.log10(target));
  const step = ([1, 2, 2.5, 5, 10].find(size => size * power >= target) ?? 10) * power;
  const ceiling = Math.max(step, Math.ceil(maximum / step) * step);
  const y = (value: number) => bottom - (bottom - top) * value / ceiling;
  const lines = Array.from({ length: Math.round(ceiling / step) + 1 }, (_, index) => {
    const value = index * step;
    return (
      <g key={value}>
        <line x1={left} y1={y(value)} x2={plotWidth - right} y2={y(value)} stroke={grid} />
        <text x={left - 6} y={y(value) + 4} textAnchor="end" {...axis}>{number.format(value)}</text>
      </g>
    );
  });
  return { y, lines };
}

function BurnUp({ burn, recent }: { burn: BurnData; recent: boolean }) {
  const start = recent ? burn.recentStart : burn.historyStart;
  const history = burn.points.filter(point => point.day >= start);
  const last = history[history.length - 1];
  const forecast = recent ? null : burn.forecast;
  const milestones = recent ? [] : burn.milestones;
  const end = Math.max(start + 1, burn.today, forecast?.latest ?? forecast?.day ?? burn.today,
    ...milestones.map(milestone => milestone.day));
  const x = (day: number) => left + (width - left - right) * (day - start) / (end - start);
  const { y, lines } = chartScale(last?.scope ?? 0);
  const path = (key: 'scope' | 'closed') => history.map(point => `${x(point.day)},${y(point[key])}`).join(' ');
  const ticks = Math.min(4, end - start);
  const rangeLabel = forecast && (forecast.latest === null ? `forecast, from ${date(forecast.earliest)}`
    : forecast.earliest === forecast.latest ? `forecast, ${date(forecast.earliest)}`
      : `forecast, ${date(forecast.earliest)} to ${date(forecast.latest)}`);

  return (
    <>
      <svg viewBox={`0 0 ${width} ${height}`} className="block w-full" role="img" aria-label="Burn-up, issues done against all known issues">
        <title>{last ? `${last.closed} of ${last.scope} issues done` : 'No issue history'}</title>
        {lines}
        {milestones.map((milestone, index) => (
          <g key={`${milestone.label}-${milestone.day}`}>
            <title>{milestone.label} due {date(milestone.day)}</title>
            <line x1={x(milestone.day)} y1={top} x2={x(milestone.day)} y2={bottom} stroke={scope} strokeDasharray="2 3" opacity=".5" />
            <text x={Math.min(x(milestone.day), width - 34)} y={index % 2 ? 20 : 10} textAnchor="middle" {...axis}>{milestone.label}</text>
          </g>
        ))}
        {forecast && last && (
          <>
            <polygon fill={done} opacity=".12" points={`${x(burn.today)},${y(last.closed)} ${x(forecast.earliest)},${y(last.scope)} ${x(forecast.latest ?? end)},${y(last.scope)} ${forecast.latest === null ? `${x(end)},${y(last.closed)}` : ''}`} />
            <line x1={x(burn.today)} y1={y(last.scope)} x2={x(forecast.latest ?? end)} y2={y(last.scope)} stroke={scope} strokeWidth="2" strokeDasharray="5 4" />
            <line x1={x(burn.today)} y1={y(last.closed)} x2={x(forecast.day)} y2={y(last.scope)} stroke={done} strokeWidth="2.5" strokeDasharray="5 4" />
            <text x={Math.min(x(forecast.day), width - 27)} y={y(last.scope) - 5} textAnchor="middle" {...axis} fill={done}>{date(forecast.day)}</text>
          </>
        )}
        {!recent && (
          <line x1={x(burn.today)} y1={top} x2={x(burn.today)} y2={bottom} stroke="#3b82f6" strokeWidth="1.5" />
        )}
        <polyline points={path('scope')} fill="none" stroke={scope} strokeWidth="2" />
        <polyline points={path('closed')} fill="none" stroke={done} strokeWidth="2.5" />
        {last && history.length === 1 && (
          <g>
            <circle cx={x(last.day)} cy={y(last.scope)} r="3" fill={scope} />
            <circle cx={x(last.day)} cy={y(last.closed)} r="3" fill={done} />
          </g>
        )}
        {Array.from({ length: ticks + 1 }, (_, index) => {
          const day = start + Math.round(index * (end - start) / ticks);
          return <text key={day} x={Math.min(x(day), width - 22)} y={height - 6} textAnchor="middle" {...axis}>{date(day)}</text>;
        })}
      </svg>
      <Legend entries={[
        ['all known issues', scope], ['done', done], ...(rangeLabel ? [[rangeLabel, 'rgba(52,211,153,.3)'] as [string, string]] : []),
      ]} />
    </>
  );
}

function WeeklyWork({ burn }: { burn: BurnData }) {
  const [measure, setMeasure] = useState<'issues' | 'prs'>('issues');
  const [choice, setChoice] = useState<number | null>(null);
  const start = measure === 'issues' ? burn.weeklyStart : burn.prStart;
  const weeks = burn.weeks.filter(week => week.day >= start);
  const plotWidth = Math.max(width, left + right + weeks.length * 59);
  const columnWidth = (plotWidth - left - right) / Math.max(1, weeks.length);
  const barWidth = Math.min(52, columnWidth * .66);
  const { y, lines } = chartScale(weeks.reduce((max, week) => {
    const work = week[measure];
    return Math.max(max, work.agents + work.people + work.unmatched);
  }, 0), plotWidth);
  const selection = weeks.find(week => week.day === choice);
  const selected = selection?.[measure];
  const unit = measure === 'issues' ? 'issues closed' : 'pull requests merged';
  const unmatched = weeks.some(week => week[measure].unmatched > 0) || (measure === 'prs' && burn.prCounts.unmatched > 0);
  const prTotal = burn.prCounts.agents + burn.prCounts.people + burn.prCounts.unmatched;

  return (
    <Card className={cardStyle}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Who did the work, per week</h2>
        <Toggle label="Measure" value={measure} options={[['issues', 'Issues closed'], ['prs', 'PRs merged']]} onChange={setMeasure} />
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${plotWidth} ${height}`} className="block w-full" style={{ minWidth: plotWidth > width ? plotWidth : undefined }}
          role="group" aria-label={`Weekly ${unit}`}>
          {lines}
          {weeks.map((entry, index) => {
            const work = entry[measure];
            const total = work.agents + work.people + work.unmatched;
            const x = left + index * columnWidth;
            const middle = x + columnWidth / 2;
            const pressed = choice === entry.day;
            const label = `Week of ${date(entry.day)}, ${work.agents} by agents, ${work.people} by people${work.unmatched ? `, ${work.unmatched} unmatched` : ''}`;
            return (
              <g key={entry.day} role="button" tabIndex={0} aria-label={label} aria-pressed={pressed}
                className="group cursor-pointer outline-none" onClick={() => setChoice(entry.day)} onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setChoice(entry.day);
                  }
                }}>
                <title>{label}</title>
                <rect x={x} y={top - 10} width={columnWidth} height={height - top + 8} rx="6"
                  className={cn('group-focus-visible:stroke-blue-400', pressed ? 'fill-blue-500/15' : 'fill-transparent')} />
                {([
                  [work.agents, 0, agents], [work.people, work.agents, people], [work.unmatched, work.agents + work.people, unknown],
                ] as const).filter(([amount]) => amount > 0).map(([amount, before, color]) => (
                  <rect key={color} x={middle - barWidth / 2} y={y(before + amount)} width={barWidth} height={y(before) - y(before + amount)} rx="2" fill={color} />
                ))}
                <text x={middle} y={y(total) - 5} textAnchor="middle" {...axis} fill="#fafafa">{total}</text>
                <text x={middle} y={height - 6} textAnchor="middle" {...axis}>{date(entry.day)}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <Legend entries={[
        ['agents (seats)', agents], ['people', people], ...(unmatched ? [['unmatched', unknown] as [string, string]] : []),
      ]} />
      <p className={cn('mt-1.5 text-[13px]', !selection && muted)} aria-live="polite">
        {selection && selected ? <>
          Week of {date(selection.day)}{' · '}<b>{selected.agents}</b> {unit} by agents, <b>{selected.people}</b> by people
          {selected.unmatched > 0 && <>, <b>{selected.unmatched}</b> unmatched</>}
          {selection.spendUsd != null && <>, <b>{usd.format(selection.spendUsd)}</b> agent spend</>}.
        </> : 'Click a week for its numbers.'}
      </p>
      {measure === 'issues' && burn.weeklyLimited && <p className={muted}>Reliable weekly issue history starts {date(burn.weeklyStart)}.</p>}
      {measure === 'prs' && prTotal > 0 && <p className={muted}>
        {burn.prCounts.unmatched} of {prTotal} recorded merges unmatched.
        {burn.undatedPrs > 0 && ` ${burn.undatedPrs} have no merge date and appear only in the totals.`}
      </p>}
    </Card>
  );
}

function Stat({ label, value, detail, color }: { label: string; value: ReactNode; detail: string; color?: string }) {
  return (
    <Card className={cn(cardStyle, 'grid content-start gap-px px-3 py-2.5', muted)}>
      <span>{label}</span>
      <strong className="text-2xl leading-[1.2] font-[650] text-collab-50" style={{ color }}>{value}</strong>
      <span>{detail}</span>
    </Card>
  );
}

function Contributors({ burn, billing }: { burn: BurnData; billing: boolean }) {
  const na = <span className={muted}>n/a</span>;
  const headings = ['Who', 'Issues closed', 'PRs merged', 'Runs', 'Run hours', ...(billing ? ['Spend'] : []), 'Hours logged'];
  return (
    <Card className={cardStyle}>
      <h2 className={cn('mb-2 font-semibold', muted)}>Seats and people</h2>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Seats and people table">
        <table className="w-full min-w-max text-[13px]">
          <thead>
            <tr>{headings.map((label, index) => (
              <th scope="col" key={label} className={cn('px-2 py-2 font-medium', muted, index ? 'text-right' : 'text-left')}>{label}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-white/[.09] border-t border-white/[.09]">
            {burn.contributors.map(row => (
              <tr key={row.id}>
                <th scope="row" className="px-2 py-2 text-left font-normal">
                  <span aria-label={row.agent ? 'Agent' : 'Person'} role="img" className="mr-1.5 inline-block size-2 rounded-full" style={{ background: row.agent ? agents : people }} />
                  {row.name}
                </th>
                <td className="px-2 py-2 text-right">{row.issuesClosed}</td>
                <td className="px-2 py-2 text-right">{row.prsMerged}</td>
                <td className="px-2 py-2 text-right">{row.agent ? row.runs : na}</td>
                <td className="px-2 py-2 text-right">{row.agent ? `${number.format(row.runHours)} h` : na}</td>
                {billing && <td className="px-2 py-2 text-right">{row.agent ? (row.spendUsd != null ? usd.format(row.spendUsd) : <span className={muted}>not reported</span>) : na}</td>}
                <td className="px-2 py-2 text-right">{row.agent ? na : (row.hoursLogged > 0 ? `${number.format(row.hoursLogged)} h` : <span className={muted}>not logged</span>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {burn.contributors.length ? <p className={cn('mt-2', muted)}>People’s hours appear where someone logged them. Spend comes from agent run reports.</p>
        : <p className={cn('mt-2', muted)}>No seats or people have worked on this project yet.</p>}
    </Card>
  );
}

export function ProjectBurn({ burn }: { burn: BurnData }) {
  const [range, setRange] = useState<'all' | 'recent'>('all');
  const recent = range === 'recent';
  const total = burn.closures.agents + burn.closures.people + burn.closures.unmatched;
  const billing = 'spendUsd' in burn;
  return (
    <div className="grid min-w-0 gap-3">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(140px,100%),1fr))] gap-2.5">
        <Stat label="Closed by agents" value={`${total ? Math.round(100 * burn.closures.agents / total) : 0}%`} detail={`${burn.closures.agents} of ${total} issues`} color={agents} />
        <Stat label="Agent run time" value={`${number.format(burn.runHours)} h`} detail={`${burn.runCount} ${burn.runCount === 1 ? 'run' : 'runs'}`} />
        <Stat label="Agent spend" value={billing ? (burn.spendUsd != null ? usd.format(burn.spendUsd) : 'not reported') : 'hidden'}
          detail={billing ? (burn.spendPerIssueUsd != null ? `${usd.format(burn.spendPerIssueUsd)} per issue an agent closed` : 'Per issue spend unavailable') : 'owners and admins only'} />
        <Stat label="Human hours logged" value={`${number.format(burn.humanHours)} h`}
          detail={`${burn.peopleLogged} of ${burn.peopleCount} people ${burn.peopleLogged === 1 ? 'logs' : 'log'} time`} />
      </div>
      <div className="grid min-w-0 gap-3 min-[861px]:grid-cols-2">
        <Card className={cardStyle}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Burn-up</h2>
            <Toggle label="Time window" value={range} options={[['all', 'Whole project'], ['recent', 'Last 30 days']]} onChange={setRange} />
          </div>
          <BurnUp burn={burn} recent={recent} />
          <p className={cn('mt-1.5', muted)}>
            {recent ? 'History only. Switch to the whole project for the forecast.' : burn.forecast
              ? `At the pace of the last three weeks, the ${burn.forecast.remaining} issues known today are done around ${date(burn.forecast.day)}.${burn.forecast.latest === null ? ' The slowest week had no closures, so the range has no latest date.' : ''}`
              : burn.remaining ? 'Forecast unavailable for the recorded three-week history.' : 'All known issues are done.'}
          </p>
          {burn.historyLimited && <p className={muted}>Reliable burn-up history starts {date(burn.historyStart)}.</p>}
        </Card>
        <WeeklyWork burn={burn} />
      </div>
      <Contributors burn={burn} billing={billing} />
    </div>
  );
}

export function BurnOverviewCard({ burn, base }: { burn: BurnData; base: string }) {
  const { agents: agentCount, people: peopleCount, unmatched } = burn.recentClosures;
  const total = agentCount + peopleCount + unmatched;
  return (
    <Card className={cardStyle}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold">Burn-up · last 30 days</h2>
        <Link href={`${base}?tab=burn`} className="rounded-lg border border-white/[.09] px-3 py-1.5 text-[13px] hover:bg-collab-700">Open Burn →</Link>
      </div>
      <BurnUp burn={burn} recent />
      {burn.historyLimited && burn.historyStart === burn.recentStart && (
        <p className={muted}>Reliable burn-up history starts {date(burn.historyStart)}.</p>
      )}
      <div className="mt-2 flex h-2 overflow-hidden rounded bg-white/[.09]" role="img"
        aria-label={`${agentCount} closed by agents, ${peopleCount} by people${unmatched ? `, ${unmatched} unmatched` : ''}`}>
        {total > 0 && [[agentCount, agents], [peopleCount, people], [unmatched, unknown]].map(([count, background]) => (
          <span key={background} style={{ flexGrow: Number(count), background }} />
        ))}
      </div>
      <Legend dots entries={[
        [`agents closed ${agentCount}`, agents], [`people closed ${peopleCount}`, people],
        ...(unmatched ? [[`unmatched ${unmatched}`, unknown] as [string, string]] : []),
      ]} />
    </Card>
  );
}
