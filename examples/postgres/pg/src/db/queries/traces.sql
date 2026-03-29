-- @mixin trace_filters($session_id::varchar?, $user_id::varchar?, $status::varchar?, $name_filter::text?, $start_date::timestamp?, $end_date::timestamp?, $tag_filters::jsonb?)
($session_id IS NULL OR "sessionId" = $session_id)
AND ($user_id IS NULL OR "userId" = $user_id)
AND ($status IS NULL OR "status" = $status)
AND ($name_filter IS NULL OR "name" ILIKE '%' || $name_filter || '%')
AND ($start_date IS NULL OR "startTime" >= $start_date)
AND ($end_date IS NULL OR "startTime" <= $end_date)
AND ($tag_filters IS NULL OR "tags" @> $tag_filters)

-- @mixin date_range($start_date::timestamp, $end_date::timestamp)
"startTime" >= $start_date AND "startTime" <= $end_date

-- List traces with filtering and pagination (equivalent to Kysely's listTraces)
-- @name ListTraces :many
SELECT * FROM traces
WHERE -- @include trace_filters
ORDER BY "startTime" DESC
-- @include paginate
;

-- Count traces matching filters (for pagination total)
-- @name CountTraces :one
SELECT COUNT(*)::integer as total FROM traces
WHERE -- @include trace_filters
;

-- Get a single trace by traceId
-- @name GetTrace :one
SELECT * FROM traces WHERE "traceId" = $trace_id;

-- Get all spans for a trace
-- @name GetTraceSpans :many
SELECT * FROM spans
WHERE "traceId" = $trace_id
ORDER BY "startTime" ASC;

-- Get all events for a trace
-- @name GetTraceEvents :many
SELECT * FROM span_events
WHERE "traceId" = $trace_id
ORDER BY "timestamp" ASC;

-- Aggregate trace stats for a date range with optional session/user filters
-- @name GetTraceStats :one
SELECT
  COUNT(*)::integer AS "totalTraces",
  COALESCE(AVG("durationMs"), 0)::integer AS "avgDurationMs",
  COUNT(CASE WHEN "status" = 'error' THEN 1 END)::integer AS "errorCount",
  COALESCE(SUM("totalCost"), 0)::integer AS "totalCost",
  COALESCE(SUM("totalTokens"), 0)::integer AS "totalTokens",
  COALESCE(SUM("spanCount"), 0)::integer AS "totalSpans"
FROM traces
WHERE -- @include date_range
AND ($session_id IS NULL OR "sessionId" = $session_id)
AND ($user_id IS NULL OR "userId" = $user_id);

-- Upsert trace (insert or update aggregates on conflict)
-- @name UpsertTrace :exec
INSERT INTO traces (
  "id", "traceId", "name", "sessionId", "userId", "status",
  "startTime", "endTime", "durationMs", "spanCount",
  "totalInputTokens", "totalOutputTokens", "totalTokens", "totalCost",
  "tags", "metadata", "createdAt", "updatedAt"
) VALUES (
  $id::varchar, $trace_id, $name, $session_id, $user_id, $status,
  $start_time::timestamp, $end_time::timestamp, $duration_ms::integer, $span_count::integer,
  $total_input_tokens::integer, $total_output_tokens::integer,
  $total_tokens::integer, $total_cost::integer,
  $tags::jsonb, $metadata::jsonb, NOW(), NOW()
)
ON CONFLICT ("traceId") DO UPDATE SET
  "name" = COALESCE(EXCLUDED."name", traces."name"),
  "sessionId" = COALESCE(EXCLUDED."sessionId", traces."sessionId"),
  "userId" = COALESCE(EXCLUDED."userId", traces."userId"),
  "status" = CASE
    WHEN EXCLUDED."status" = 'error' THEN 'error'
    WHEN EXCLUDED."status" = 'ok' AND traces."status" != 'error' THEN 'ok'
    ELSE traces."status"
  END,
  "startTime" = LEAST(traces."startTime", EXCLUDED."startTime"),
  "endTime" = GREATEST(
    COALESCE(traces."endTime", EXCLUDED."endTime"),
    COALESCE(EXCLUDED."endTime", traces."endTime")
  ),
  "durationMs" = EXTRACT(EPOCH FROM (
    GREATEST(
      COALESCE(traces."endTime", EXCLUDED."endTime"),
      COALESCE(EXCLUDED."endTime", traces."endTime")
    ) -
    LEAST(traces."startTime", EXCLUDED."startTime")
  ))::integer * 1000,
  "spanCount" = traces."spanCount" + EXCLUDED."spanCount",
  "totalInputTokens" = traces."totalInputTokens" + EXCLUDED."totalInputTokens",
  "totalOutputTokens" = traces."totalOutputTokens" + EXCLUDED."totalOutputTokens",
  "totalTokens" = traces."totalTokens" + EXCLUDED."totalTokens",
  "totalCost" = traces."totalCost" + EXCLUDED."totalCost",
  "tags" = traces."tags" || EXCLUDED."tags",
  "metadata" = traces."metadata" || EXCLUDED."metadata",
  "updatedAt" = NOW();
