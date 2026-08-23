import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();
crons.interval('expire stale village presence', { minutes: 1 }, internal.world.expireStale);
export default crons;
