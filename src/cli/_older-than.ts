export interface OlderThanResolution {
  olderThan: string;
  cutoffTimestamp: string;
}

export function resolveOlderThan(rawValue: string, now: Date): OlderThanResolution {
  const normalized = rawValue.trim().toLowerCase();
  const match = normalized.match(/^(\d+)\s+(minute|minutes|hour|hours|day|days|week|weeks|month|months|year|years)$/);
  if (match == null) {
    throw new Error(`invalid older-than interval: ${rawValue}`);
  }

  const amount = Number(match[1]);
  const unit = match[2];
  const cutoff = new Date(now.getTime());

  switch (unit) {
    case "minute":
    case "minutes":
      cutoff.setUTCMinutes(cutoff.getUTCMinutes() - amount);
      break;
    case "hour":
    case "hours":
      cutoff.setUTCHours(cutoff.getUTCHours() - amount);
      break;
    case "day":
    case "days":
      cutoff.setUTCDate(cutoff.getUTCDate() - amount);
      break;
    case "week":
    case "weeks":
      cutoff.setUTCDate(cutoff.getUTCDate() - amount * 7);
      break;
    case "month":
    case "months":
      cutoff.setUTCMonth(cutoff.getUTCMonth() - amount);
      break;
    case "year":
    case "years":
      cutoff.setUTCFullYear(cutoff.getUTCFullYear() - amount);
      break;
    default:
      throw new Error(`invalid older-than unit: ${unit}`);
  }

  return {
    olderThan: normalized,
    cutoffTimestamp: cutoff.toISOString()
  };
}
