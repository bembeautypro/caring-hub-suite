ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS documents_pinned_idx
  ON public.documents (patient_id)
  WHERE is_pinned = true AND deleted_at IS NULL;