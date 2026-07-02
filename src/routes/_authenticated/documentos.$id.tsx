import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, ExternalLink, WifiOff } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { getSignedMedicalDocUrl } from "@/lib/supabase/storage";
import { useOfflineDoc } from "@/hooks/useOfflineDoc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AppHeader } from "@/components/layout/AppHeader";
import { BottomNav } from "@/components/layout/BottomNav";

// react-pdf depends on pdfjs which references DOMMatrix (browser-only).
// Disable SSR for this route and lazy-load the viewer to keep pdfjs out of the
// server bundle entirely.
const PdfViewer = lazy(() => import("@/components/documents/PdfViewer"));

export const Route = createFileRoute("/_authenticated/documentos/$id")({
  ssr: false,
  head: () => ({ meta: [{ title: "Documento — Amparo" }] }),
  component: DocumentViewer,
});

type DocumentRow = {
  id: string;
  title: string;
  file_path: string;
  file_mime_type: string | null;
};

function useOnline() {
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}

function DocumentViewer() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const online = useOnline();
  const offline = useOfflineDoc(id);

  const [doc, setDoc] = useState<DocumentRow | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("id, title, file_path, file_mime_type")
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        // Se estiver offline mas temos blob local, seguimos com título genérico.
        if (!offline.available) {
          setLoadError(error.message);
        }
        return;
      }
      if (!data) {
        if (!offline.available) setLoadError("Documento não encontrado.");
        return;
      }
      setDoc(data as DocumentRow);
      if (!online) return; // sem internet: usa blob local, não tenta signed URL
      try {
        const url = await getSignedMedicalDocUrl(data.file_path, 3600);
        if (!cancelled) setSignedUrl(url);
      } catch (err) {
        if (!cancelled && !offline.available) {
          const msg = err instanceof Error ? err.message : "Erro ao gerar URL do arquivo.";
          setLoadError(msg);
          toast.error(msg);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, online, offline.available]);

  // Fonte efetiva do arquivo: blob local se disponível, senão signed URL.
  const source = offline.available ? offline.blobUrl : signedUrl;
  const mime = offline.available ? offline.mime : doc?.file_mime_type ?? null;
  const filePath = doc?.file_path ?? null;

  const isPdf = useMemo(() => {
    if (mime === "application/pdf") return true;
    if (filePath?.toLowerCase().endsWith(".pdf")) return true;
    return false;
  }, [mime, filePath]);

  const isImage = useMemo(() => (mime ?? "").startsWith("image/"), [mime]);

  function openExternal() {
    if (source) window.open(source, "_blank", "noopener,noreferrer");
  }

  const waitingForSource = !source && !loadError && offline.ready;
  const offlineWithoutCache = !online && !offline.available && offline.ready;

  return (
    <div className="min-h-screen bg-background pb-24">
      <AppHeader />
      <main className="mx-auto max-w-3xl space-y-4 px-5 py-4">
        <header className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate({ to: "/documentos" })}
            aria-label="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">
            {doc?.title ?? "Documento"}
          </h1>
          {source && (
            <Button
              variant="ghost"
              size="icon"
              onClick={openExternal}
              aria-label="Abrir em nova aba"
            >
              <ExternalLink className="h-5 w-5" />
            </Button>
          )}
        </header>

        {offline.available && !online && (
          <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary">
            <WifiOff className="h-4 w-4" />
            Mostrando cópia offline salva neste dispositivo.
          </div>
        )}

        {offlineWithoutCache ? (
          <div className="rounded-2xl border bg-card p-6 text-center">
            <WifiOff className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Sem conexão</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Este documento não está salvo offline. Favorite-o quando estiver online para acessá-lo aqui sem internet.
            </p>
            <Button asChild variant="outline" className="mt-4">
              <Link to="/documentos">Voltar para documentos</Link>
            </Button>
          </div>
        ) : loadError ? (
          <div className="rounded-2xl border bg-card p-6 text-center">
            <p className="text-sm text-destructive">{loadError}</p>
            <Button asChild variant="outline" className="mt-4">
              <Link to="/documentos">Voltar para documentos</Link>
            </Button>
          </div>
        ) : waitingForSource ? (
          <Skeleton className="h-96 w-full rounded-2xl" />
        ) : isPdf && source ? (
          <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
            <PdfViewer url={source} onOpenExternal={openExternal} />
          </Suspense>
        ) : isImage && source ? (
          <div className="rounded-2xl border bg-card p-3">
            <img
              src={source}
              alt={doc?.title ?? "Documento"}
              className="mx-auto max-h-[80vh] w-auto rounded-lg"
            />
          </div>
        ) : source ? (
          <div className="rounded-2xl border bg-card p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Visualização inline não disponível para este tipo de arquivo.
            </p>
            <Button onClick={openExternal} className="mt-4">
              <Download className="mr-2 h-4 w-4" />
              Abrir arquivo
            </Button>
          </div>
        ) : (
          <Skeleton className="h-96 w-full rounded-2xl" />
        )}
      </main>
      <BottomNav />
    </div>
  );
}
