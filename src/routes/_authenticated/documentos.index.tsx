import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  MoreVertical,
  FileText,
  FlaskConical,
  CreditCard,
  IdCard,
  Hospital,
  Syringe,
  Pill,
  File,
  Plus,
  Search,
  Star,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { searchDocuments } from "@/lib/documentos";
import { getSignedMedicalDocUrl } from "@/lib/supabase/storage";
import {
  putBlob,
  deleteBlob,
  listIds,
  countBlobs,
  OFFLINE_DOC_LIMIT,
  OFFLINE_DOC_MAX_BYTES,
} from "@/lib/offline-docs";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AppHeader } from "@/components/layout/AppHeader";
import { BottomNav } from "@/components/layout/BottomNav";
import { PatientSelector } from "@/components/patients/PatientSelector";
import { usePatients } from "@/hooks/useActivePatient";

export const Route = createFileRoute("/_authenticated/documentos/")({
  head: () => ({ meta: [{ title: "Documentos — Amparo" }] }),
  component: DocumentosList,
});

type DocType =
  | "prescription"
  | "exam"
  | "report"
  | "medical_request"
  | "insurance_card"
  | "id_document"
  | "discharge"
  | "vaccine"
  | "medication_photo"
  | "other";

type Document = {
  id: string;
  title: string;
  type: DocType;
  file_path: string;
  file_mime_type: string | null;
  document_date: string | null;
  institution: string | null;
  doctor_name: string | null;
  is_pinned: boolean;
};

const TYPE_META: Record<DocType, { label: string; Icon: React.ElementType }> = {
  prescription: { label: "Receita", Icon: FileText },
  exam: { label: "Exame", Icon: FlaskConical },
  report: { label: "Laudo", Icon: FlaskConical },
  medical_request: { label: "Pedido médico", Icon: FileText },
  insurance_card: { label: "Cartão do convênio", Icon: CreditCard },
  id_document: { label: "Documento de identidade", Icon: IdCard },
  discharge: { label: "Alta hospitalar", Icon: Hospital },
  vaccine: { label: "Vacina", Icon: Syringe },
  medication_photo: { label: "Foto de embalagem", Icon: Pill },
  other: { label: "Outro", Icon: File },
};

const ALL_TYPES = Object.keys(TYPE_META) as DocType[];

function DocumentosList() {
  const navigate = useNavigate();
  const { patients, active, activeId, setActiveId, loading: loadingPatients } = usePatients();

  const [docs, setDocs] = useState<Document[] | null>(null);
  const [filterType, setFilterType] = useState<DocType | "all">("all");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionDoc, setActionDoc] = useState<Document | null>(null);
  const [toArchive, setToArchive] = useState<Document | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);


  async function load(query: string) {
    if (!active) return;
    setDocs(null);

    const { data, error } = await searchDocuments({ patientId: active.id, query });

    if (error) {
      toast.error(error.message);
      setDocs([]);
      return;
    }
    setDocs((data ?? []) as Document[]);
  }

  useEffect(() => {
    if (active) void load(searchQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, searchQuery]);

  // Realtime: revalida a lista quando qualquer documento do paciente ativo muda.
  // RLS filtra os eventos server-side — só chegam mudanças que o usuário pode ver.
  useEffect(() => {
    if (!active) return;
    const patientId = active.id;
    const channel = supabase
      .channel(`documents:${patientId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "documents",
          filter: `patient_id=eq.${patientId}`,
        },
        () => {
          void load(searchQuery);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, searchQuery]);

  function handleSearchChange(value: string) {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchQuery(value);
    }, 300);
  }

  function handleView(doc: Document) {
    navigate({ to: `/documentos/${doc.id}` as never });
    setActionDoc(null);
  }


  async function softDelete(doc: Document) {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("documents")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: u.user?.id ?? null,
      })
      .eq("id", doc.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    // Arquivado: remove cache offline local também.
    void deleteBlob(doc.id);
    toast.success("Documento arquivado.");
    setToArchive(null);
    setActionDoc(null);
    void load(searchQuery);
  }

  async function pinDocument(doc: Document) {
    setActionDoc(null);
    try {
      const cached = await countBlobs();
      if (cached >= OFFLINE_DOC_LIMIT) {
        toast.error(
          `Limite de ${OFFLINE_DOC_LIMIT} documentos offline atingido neste dispositivo.`,
        );
        return;
      }
      toast.loading("Baixando para uso offline…", { id: `pin-${doc.id}` });
      const url = await getSignedMedicalDocUrl(doc.file_path, 300);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Falha no download (${res.status}).`);
      const blob = await res.blob();
      if (blob.size > OFFLINE_DOC_MAX_BYTES) {
        toast.error("Arquivo excede 20 MB — não pode ser salvo offline.", {
          id: `pin-${doc.id}`,
        });
        return;
      }
      await putBlob(doc.id, blob, doc.file_mime_type ?? blob.type ?? "application/octet-stream");
      const { error } = await supabase
        .from("documents")
        .update({ is_pinned: true })
        .eq("id", doc.id);
      if (error) throw error;
      toast.success("Disponível offline.", { id: `pin-${doc.id}` });
      void load(searchQuery);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar offline.";
      toast.error(msg, { id: `pin-${doc.id}` });
    }
  }

  async function unpinDocument(doc: Document) {
    setActionDoc(null);
    await deleteBlob(doc.id);
    const { error } = await supabase
      .from("documents")
      .update({ is_pinned: false })
      .eq("id", doc.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Removido do offline.");
    void load(searchQuery);
  }

  // Reconciliação: se o flag do banco diverge do IDB local, sincroniza.
  // - Pinned no banco mas sem blob → baixa em background.
  // - Blob local órfão (não está mais pinned ou foi arquivado) → apaga.
  useEffect(() => {
    if (!docs) return;
    let cancelled = false;
    (async () => {
      const localIds = new Set(await listIds());
      if (cancelled) return;
      const remotePinned = new Set(docs.filter((d) => d.is_pinned).map((d) => d.id));

      // Órfãos: no IDB mas não pinned na lista atual.
      for (const id of localIds) {
        if (!remotePinned.has(id) && docs.some((d) => d.id === id)) {
          void deleteBlob(id);
        }
      }
      // Faltantes: pinned no banco mas sem blob local.
      for (const doc of docs) {
        if (!doc.is_pinned || localIds.has(doc.id)) continue;
        try {
          const url = await getSignedMedicalDocUrl(doc.file_path, 300);
          const res = await fetch(url);
          if (!res.ok) continue;
          const blob = await res.blob();
          if (blob.size > OFFLINE_DOC_MAX_BYTES) continue;
          if (cancelled) return;
          await putBlob(doc.id, blob, doc.file_mime_type ?? blob.type ?? "application/octet-stream");
        } catch {
          /* silencioso — reconciliação é best-effort */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [docs]);


  const filtered =
    filterType === "all" ? (docs ?? []) : (docs ?? []).filter((d) => d.type === filterType);

  return (
    <div className="min-h-screen bg-background pb-24">
      <AppHeader />
      {patients && patients.length > 1 && (
        <PatientSelector patients={patients} activeId={activeId} onChange={setActiveId} />
      )}

      <main className="mx-auto max-w-md space-y-4 px-5 py-4">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Documentos</h1>
        </header>

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Buscar documentos…"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="h-10 w-full rounded-xl border bg-card pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          <FilterChip
            label="Todos"
            active={filterType === "all"}
            onClick={() => setFilterType("all")}
          />
          {ALL_TYPES.map((t) => (
            <FilterChip
              key={t}
              label={TYPE_META[t].label}
              active={filterType === t}
              onClick={() => setFilterType(t)}
            />
          ))}
        </div>

        {loadingPatients || docs === null ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
          </div>
        ) : !active ? (
          <p className="text-sm text-muted-foreground">Nenhum paciente ativo.</p>
        ) : filtered.length === 0 ? (
          <EmptyState hasSearch={searchInput.trim().length > 0} filterType={filterType} />
        ) : (
          <ul className="space-y-3">
            {filtered.map((doc) => (
              <DocCard key={doc.id} doc={doc} onOpenActions={() => setActionDoc(doc)} />
            ))}
          </ul>
        )}
      </main>

      {/* FAB */}
      <Link
        to="/documentos/novo"
        aria-label="Novo documento"
        className="fixed flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg active:scale-95"
        style={{ bottom: "72px", right: "16px", zIndex: 50 }}
      >
        <Plus className="h-6 w-6" />
      </Link>

      {/* Bottom sheet ações */}
      <Sheet open={!!actionDoc} onOpenChange={(o) => !o && setActionDoc(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle className="text-left">{actionDoc?.title}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 grid gap-2 pb-6">
            <ActionButton
              label="Ver"
              onClick={() => actionDoc && handleView(actionDoc)}
            />
            <ActionButton
              label="Editar metadados"
              onClick={() => {
                if (actionDoc) navigate({ to: `/documentos/${actionDoc.id}/editar` as never });
                setActionDoc(null);
              }}
            />
            <ActionButton
              label="Arquivar"
              danger
              onClick={() => {
                if (actionDoc) {
                  setToArchive(actionDoc);
                  setActionDoc(null);
                }
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* AlertDialog archival */}
      <AlertDialog open={!!toArchive} onOpenChange={(o) => !o && setToArchive(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arquivar documento?</AlertDialogTitle>
            <AlertDialogDescription>
              "{toArchive?.title}" será arquivado e não aparecerá mais na lista.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => toArchive && softDelete(toArchive)}
            >
              Arquivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BottomNav />
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:bg-muted"
      }`}
    >
      {label}
    </button>
  );
}

function DocCard({
  doc,
  onOpenActions,
}: {
  doc: Document;
  onOpenActions: () => void;
}) {
  const { label, Icon } = TYPE_META[doc.type] ?? TYPE_META.other;
  const dateStr = doc.document_date
    ? new Date(doc.document_date + "T12:00:00").toLocaleDateString("pt-BR")
    : null;

  return (
    <li className="rounded-2xl border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-base font-semibold">{doc.title}</p>
            <button
              type="button"
              onClick={onOpenActions}
              aria-label="Ações"
              className="-mr-2 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
            >
              <MoreVertical className="h-5 w-5" />
            </button>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
          {(dateStr || doc.institution || doc.doctor_name) && (
            <p className="mt-1 text-xs text-muted-foreground">
              {[dateStr, doc.institution, doc.doctor_name].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

function ActionButton({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[52px] items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left active:bg-muted ${
        danger ? "text-destructive" : ""
      }`}
    >
      <span className="text-base font-medium">{label}</span>
    </button>
  );
}

function EmptyState({
  hasSearch,
  filterType,
}: {
  hasSearch: boolean;
  filterType: DocType | "all";
}) {
  if (hasSearch) {
    return (
      <div className="rounded-2xl border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">Nenhum documento encontrado para esta busca.</p>
      </div>
    );
  }
  if (filterType !== "all") {
    return (
      <div className="rounded-2xl border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Nenhum documento do tipo "{TYPE_META[filterType].label}".
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border bg-card p-6 text-center">
      <p className="text-sm text-muted-foreground">Nenhum documento cadastrado ainda.</p>
      <Button asChild className="mt-4 h-[52px] w-full">
        <Link to="/documentos/novo">Adicionar documento</Link>
      </Button>
    </div>
  );
}
