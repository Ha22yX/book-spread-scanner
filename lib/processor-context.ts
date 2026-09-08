// Only two earlier, non-deleted captures. Never ship the entire session to the worker.
export const PRIOR_CONTEXT_SQL = "SELECT data,status,revision FROM spreads WHERE session_id=? AND sequence<? AND status!='deleted' ORDER BY sequence DESC LIMIT 2";
