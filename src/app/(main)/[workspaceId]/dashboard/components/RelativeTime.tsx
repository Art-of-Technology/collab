const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;

function utcDay(timestamp: number) {
  return Math.floor(timestamp / day);
}

export default function RelativeTime({ value, now, due = false }: {
  value: string | null;
  now: string;
  due?: boolean;
}) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return <span>Not recorded</span>;

  const timestamp = date.getTime();
  const reference = new Date(now).getTime();
  const daysAhead = utcDay(timestamp) - utcDay(reference);
  const difference = timestamp - reference;
  const elapsed = Math.abs(difference);
  let text: string;

  if (due && difference >= 0 && daysAhead <= 1) {
    text = daysAhead === 1 ? 'due tomorrow' : 'due today';
  } else if (elapsed < minute && !due) {
    text = difference > 0 ? 'soon' : 'just now';
  } else {
    const duration = elapsed >= day ? `${Math.floor(elapsed / day)} d`
      : elapsed >= hour ? `${Math.floor(elapsed / hour)} h`
      : `${Math.max(1, Math.floor(elapsed / minute))} min`;
    text = difference > 0 ? `${due ? 'due ' : ''}in ${duration}` : `${duration} ago`;
  }

  const utc = date.toISOString();
  return <time dateTime={utc} title={utc}>{text}</time>;
}
