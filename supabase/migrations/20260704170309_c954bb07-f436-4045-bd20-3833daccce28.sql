-- Lock down emergency_rate_limits to service_role only.
-- Revoke any client-role privileges and add explicit deny policies so it's
-- unambiguous that anon/authenticated cannot read or write this table.
REVOKE ALL ON public.emergency_rate_limits FROM anon, authenticated;
GRANT ALL ON public.emergency_rate_limits TO service_role;

DROP POLICY IF EXISTS "Deny all client access to emergency_rate_limits" ON public.emergency_rate_limits;
CREATE POLICY "Deny all client access to emergency_rate_limits"
  ON public.emergency_rate_limits
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE public.emergency_rate_limits IS
  'Server-only. Written/read exclusively via supabaseAdmin (service_role) from logEmergencyAccess server function. RLS restrictive policy denies all anon/authenticated access.';