// Scheduled trigger (UTC). Only calls the app's job route; the job logic is in src/app/api/cron/.
import { callCronRoute } from "./_cron.mjs";

const run = async () => callCronRoute("/api/cron/payout-notices");
export default run;

export const config = { schedule: "0 13 * * *" };
