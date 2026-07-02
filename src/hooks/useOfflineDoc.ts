import { useEffect, useState } from "react";
import { getBlob, hasBlob } from "@/lib/offline-docs";

/**
 * Retorna estado do cache offline para um documento específico.
 * Cria e revoga o objectURL automaticamente.
 */
export function useOfflineDoc(id: string | null | undefined) {
  const [ready, setReady] = useState(false);
  const [available, setAvailable] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [mime, setMime] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    setReady(false);
    setAvailable(false);
    setBlobUrl(null);
    setMime(null);

    if (!id) {
      setReady(true);
      return;
    }

    (async () => {
      const record = await getBlob(id);
      if (cancelled) return;
      if (record) {
        url = URL.createObjectURL(record.blob);
        setBlobUrl(url);
        setMime(record.mime);
        setAvailable(true);
      }
      setReady(true);
    })();

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);

  return { ready, available, blobUrl, mime };
}

/** Versão sem objectURL, só para "está cacheado?". */
export function useHasOfflineDoc(id: string | null | undefined) {
  const [has, setHas] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!id) {
      setHas(false);
      return;
    }
    void hasBlob(id).then((v) => {
      if (!cancelled) setHas(v);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);
  return has;
}
