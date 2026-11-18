CREATE INDEX IF NOT EXISTS weighing_requests_finished_production_idx
ON weighing_requests(request_date DESC,request_id DESC)
WHERE request_type='Production' AND status='Completed';
