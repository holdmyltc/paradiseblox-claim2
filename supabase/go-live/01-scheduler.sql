-- Runs the background jobs every 2 minutes:
-- auto Received after 24 hours, risk re-checks, unread-message emails,
-- and the daily clean-up of screenshots older than 120 days.
--
-- Before running: replace PASTE_CRON_SECRET_HERE with the CRON_SECRET you added in Vercel.
-- Safe to run again. It replaces the old schedule.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'paradiseblox-tick';

select cron.schedule(
  'paradiseblox-tick',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := 'https://orders.paradiseblox.com/api/cron/tick',
    headers := jsonb_build_object('Authorization', 'Bearer PASTE_CRON_SECRET_HERE', 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);

-- To check it is running (after a few minutes):
-- select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
-- select status_code, created from net._http_response order by created desc limit 5;
