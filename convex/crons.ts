import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Cleanup expired telemetry data daily at 2 AM UTC
// Wrapper function will calculate currentTime dynamically at runtime
crons.daily(
  "cleanup expired telemetry",
  { hourUTC: 2, minuteUTC: 0 },
  internal.cron.cleanupExpiredTelemetryWrapper
);

// Aggregate spans into 15-minute rollups every 15 minutes
// Wrapper function will calculate window dynamically at runtime
crons.interval(
  "aggregate 15min rollups",
  { minutes: 15 },
  internal.cron.aggregateSpansIntoRollupsWrapper,
  { granularityMin: 15 }
);

// Aggregate spans into hourly rollups every hour at 5 minutes past
// Wrapper function will calculate window dynamically at runtime
crons.hourly(
  "aggregate hourly rollups",
  { minuteUTC: 5 },
  internal.cron.aggregateSpansIntoRollupsWrapper,
  { granularityMin: 60 }
);

// Aggregate spans into daily rollups once per day at 1 AM UTC
// Wrapper function will calculate window dynamically at runtime
crons.daily(
  "aggregate daily rollups",
  { hourUTC: 1, minuteUTC: 0 },
  internal.cron.aggregateSpansIntoRollupsWrapper,
  { granularityMin: 1440 }
);

export default crons;
