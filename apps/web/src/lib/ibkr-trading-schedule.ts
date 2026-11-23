import {
  CalendarDate,
  CalendarDateTime,
  fromAbsolute,
  toZoned,
} from "@internationalized/date";
import { Schema } from "effect";

/**
 * A listing's trading hours from `trsrv/secdef/schedule`, in the exchange's
 * own time zone, as IBKR's Android chart takes them from its trading-sessions
 * request rather than guessing them from bars. Times stay local until a
 * session is placed on a date, so clock changes land on the right day.
 */

const LooseValue = Schema.optional(
  Schema.NullOr(Schema.Union([Schema.String, Schema.Number]))
);

const Interval = Schema.Struct({
  openingTime: LooseValue,
  closingTime: LooseValue,
});

/** IBKR documents these as objects but sends arrays; either is read. */
const Intervals = Schema.optional(
  Schema.NullOr(Schema.Union([Schema.Array(Interval), Interval]))
);

const Venue = Schema.Struct({
  exchange: Schema.optional(Schema.NullOr(Schema.String)),
  timezone: Schema.optional(Schema.NullOr(Schema.String)),
  schedules: Schema.optional(
    Schema.NullOr(
      Schema.Array(
        Schema.Struct({
          tradingScheduleDate: LooseValue,
          // Liquid (regular) hours, when they differ from the trading times.
          sessions: Intervals,
          // All trading, extended hours included. Spelled both ways.
          tradingtimes: Intervals,
          tradingTimes: Intervals,
        })
      )
    )
  ),
});

const decodeSchedule = Schema.decodeUnknownSync(
  Schema.Union([Schema.Array(Venue), Venue])
);

/**
 * Minutes after the exchange's local midnight on the schedule's date. An
 * interval that runs over midnight ends on that date and opens the day
 * before, so its `open` is negative, as TradingView reads IBKR's sessions.
 */
interface LocalInterval {
  open: number;
  close: number;
}

interface ScheduleDay {
  /** Regular hours. */
  liquid: readonly LocalInterval[];
  /** Regular and extended hours; empty on a day the market is shut. */
  trading: readonly LocalInterval[];
}

export interface TradingSchedule {
  /** IANA time zone, e.g. "America/New_York". */
  timeZone: string;
  /**
   * By IBKR's `tradingScheduleDate`: a real date ("20261126") for a holiday
   * or early close, else a weekday code, "20000101" for any Saturday to
   * "20000107" for any Friday.
   */
  days: ReadonlyMap<string, ScheduleDay>;
}

/** "0930" or 930 → 570; undefined when missing or not a time of day. */
const minutesOf = (value: string | number | null | undefined) => {
  const text = String(value ?? "").trim();
  if (!/^\d{1,4}$/u.test(text)) {
    return;
  }
  const digits = text.padStart(4, "0");
  const hours = Number(digits.slice(0, 2));
  const minutes = Number(digits.slice(2));
  return minutes < 60 && hours * 60 + minutes <= 1440
    ? hours * 60 + minutes
    : undefined;
};

const intervalsOf = (value: typeof Intervals.Type): LocalInterval[] => {
  const list = Array.isArray(value) ? value : [value];
  return list
    .flatMap((interval) => {
      if (!interval) {
        return [];
      }
      const open = minutesOf(interval.openingTime);
      const close = minutesOf(interval.closingTime);
      if (open === undefined || close === undefined) {
        return [];
      }
      // IBKR marks a day the market is shut, weekends and holidays, with
      // "0000"-"0000". A close before the open means the interval opened
      // the day before, as TradingView reads IBKR's sessions.
      if (close === open) {
        return [];
      }
      return [{ open: close < open ? open - 1440 : open, close }];
    })
    .toSorted((a, b) => a.open - b.open);
};

const knownTimeZone = (zone: string) => {
  try {
    fromAbsolute(0, zone);
    return true;
  } catch {
    return false;
  }
};

/**
 * The schedule for `exchange` (IBKR's code, e.g. "NASDAQ"); without a match,
 * the only venue IBKR lists, or the first when no exchange was asked for.
 * Undefined when several venues came back and none is `exchange`, so an
 * ambiguous symbol never gets another venue's hours; and without a time
 * zone or any days.
 */
export const parseTradingSchedule = (
  raw: Schema.Json,
  exchange?: string
): TradingSchedule | undefined => {
  const decoded = decodeSchedule(raw);
  const venues = Array.isArray(decoded) ? decoded : [decoded];
  const match =
    exchange === undefined
      ? undefined
      : venues.find(
          (candidate) =>
            candidate.exchange?.toUpperCase() === exchange.toUpperCase()
        );
  const venue =
    match ??
    (venues.length === 1 || exchange === undefined ? venues[0] : undefined);
  const timeZone = venue?.timezone?.trim();
  if (!timeZone || !knownTimeZone(timeZone)) {
    return;
  }
  const days = new Map<string, ScheduleDay>();
  for (const day of venue.schedules ?? []) {
    const key = String(day.tradingScheduleDate ?? "").trim();
    if (!/^\d{8}$/u.test(key)) {
      continue;
    }
    days.set(key, {
      liquid: intervalsOf(day.sessions),
      trading: intervalsOf(day.tradingtimes ?? day.tradingTimes),
    });
  }
  return days.size > 0 ? { timeZone, days } : undefined;
};

/** IBKR's weekday code: Saturday "20000101" to Friday "20000107". */
const weekdayCode = (date: CalendarDate) => {
  const weekday = new Date(
    Date.UTC(date.year, date.month - 1, date.day)
  ).getUTCDay();
  return `2000010${((weekday + 1) % 7) + 1}`;
};

const dateCode = (date: CalendarDate) =>
  `${date.year}${String(date.month).padStart(2, "0")}${String(date.day).padStart(2, "0")}`;

/** The exchange's calendar date at `time` (epoch ms). */
export const exchangeDate = (schedule: TradingSchedule, time: number) => {
  const zoned = fromAbsolute(time, schedule.timeZone);
  return new CalendarDate(zoned.year, zoned.month, zoned.day);
};

/**
 * One trading day in epoch ms: `start` to `end` is all trading, extended
 * hours included; `open` to `close` the regular session.
 */
export interface ScheduledSession {
  start: number;
  open: number;
  close: number;
  end: number;
}

/**
 * The session on `date`, its local times placed in the exchange's time zone
 * on that date. A dated entry (a holiday or early close) wins over the
 * weekday's. Undefined when the market is shut that day.
 */
export const scheduledSession = (
  schedule: TradingSchedule,
  date: CalendarDate
): ScheduledSession | undefined => {
  const day =
    schedule.days.get(dateCode(date)) ?? schedule.days.get(weekdayCode(date));
  // Without separate liquid hours, all of the day's trading is regular.
  const liquid = day?.liquid.length ? day.liquid : (day?.trading ?? []);
  const [firstLiquid] = liquid;
  const lastLiquid = liquid.at(-1);
  if (!(day && firstLiquid && lastLiquid)) {
    return;
  }
  // The trading around the regular session: whatever opens that day, and
  // anything overlapping regular hours. An overnight interval that ends this
  // morning belongs to the previous evening's session.
  const around = day.trading.filter(
    (interval) =>
      interval.open >= 0 ||
      (interval.close >= firstLiquid.open && interval.open <= lastLiquid.close)
  );
  const midnight = new CalendarDateTime(date.year, date.month, date.day);
  const at = (minutes: number) =>
    toZoned(midnight.add({ minutes }), schedule.timeZone).toDate().getTime();
  return {
    start: at(Math.min(firstLiquid.open, ...around.map(({ open }) => open))),
    open: at(firstLiquid.open),
    close: at(lastLiquid.close),
    end: at(Math.max(lastLiquid.close, ...around.map(({ close }) => close))),
  };
};

/**
 * The session `time` belongs to: the latest one that had started by then.
 * From the next exchange date back a week, so a session that opens the
 * evening before (Monday's from Sunday 17:00) is found from a Sunday-evening
 * bar, and Friday's from a bar before Monday's pre-market or after a holiday.
 */
export const sessionAt = (schedule: TradingSchedule, time: number) => {
  const date = exchangeDate(schedule, time);
  for (let offset = 1; offset >= -7; offset -= 1) {
    const session = scheduledSession(schedule, date.add({ days: offset }));
    if (session && session.start <= time) {
      return session;
    }
  }
};

/**
 * The session a chart whose latest bar is at `time` shows: the one in
 * progress, else, before that day's session opens (pre-market bars when
 * the schedule lists only regular hours), that day's; else the last one,
 * after its close.
 */
export const chartSessionAt = (schedule: TradingSchedule, time: number) => {
  const started = sessionAt(schedule, time);
  if (started && time <= started.end) {
    return started;
  }
  const day = scheduledSession(schedule, exchangeDate(schedule, time));
  return day && day.start > time ? day : started;
};
