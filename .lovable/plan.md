## Objetivo

Usuário marca documentos como "favoritos". Ao marcar, o arquivo é baixado e guardado no dispositivo (IndexedDB). No viewer, se o arquivo estiver cacheado, ele abre mesmo sem internet e mesmo depois que a URL assinada expira.

Sem instalar `vite-plugin-pwa`. Sem service worker de app-shell. Isso mantém o preview do Lovable seguro e reduz a superfície de mudança.

## O que muda para o usuário

- Cada card de documento ganha um ícone de estrela e uma ação "Salvar offline" / "Remover offline" no bottom sheet.
- Documentos favoritados mostram badge "Offline" no card.
- No viewer, se estiver sem internet, o arquivo favoritado abre normalmente. Não favoritados mostram mensagem "Sem conexão — favorite para ver offline".
- Nada de cache silencioso: só é guardado o que o usuário marcou. Bom para LGPD.

## Estrutura técnica

### Banco (1 migration curta)

- `documents.is_pinned boolean not null default false`.
- Sem novas policies: as existentes já cobrem UPDATE.
- Publication `supabase_realtime` já inclui `documents` (Parte 1), então favoritar em um dispositivo aparece em outro.

### Cliente

- `src/lib/offline-docs.ts`: wrapper mínimo sobre IndexedDB (sem dependência nova — API nativa) com `putBlob(id, blob, mime)`, `getBlob(id)`, `deleteBlob(id)`, `hasBlob(id)`, `listIds()`.
- `src/hooks/useOfflineDoc.ts`: hook que retorna `{ hasOffline, saveOffline, removeOffline, blobUrl }` para um documento. Cria e revoga `URL.createObjectURL` corretamente.
- Ação "Salvar offline" no sheet de `documentos.index.tsx`: baixa via `getSignedMedicalDocUrl` + `fetch`, grava no IDB, seta `is_pinned=true`. "Remover offline": deleta blob + `is_pinned=false`.
- `documentos.$id.tsx`: se `hasBlob(id)`, usa `blobUrl` no viewer/img direto (sem depender de signed URL). Se offline e sem blob, mostra estado vazio com CTA "Favoritar quando voltar online".
- Card mostra estrela preenchida quando `is_pinned`.

### Sincronização de cache com o banco

- Ao carregar a lista, comparar `is_pinned=true` do banco com `listIds()` do IDB. Se um documento foi favoritado em outro dispositivo, baixar em background. Se foi desmarcado, apagar do IDB local.
- Se o documento foi arquivado (soft delete), remover o blob local. Realtime da Parte 1 dispara o refresh que executa essa reconciliação.

### Limites e proteções

- Limite de 20 documentos offline por dispositivo (aviso no UI ao passar). Impede encher o disco do celular.
- Bloquear favoritar arquivos maiores que 20 MB (mesmo limite do upload).
- IndexedDB é por origem — publicado e preview têm caches separados; isso é ok.

## O que NÃO faz parte deste plano

- App-shell offline (navegação sem internet). Requer `vite-plugin-pwa` e a skill de PWA do Lovable. Fica para uma segunda rodada se você quiser.
- Sync bidirecional de edições feitas offline. O app continua exigindo internet para editar/uploadar.
- Push de "arquivo pronto offline" — o download é síncrono no clique.

## Riscos

- iOS Safari limita IndexedDB em ~1 GB por origem e pode purgar em pressão de disco; documentar no README que "offline" é best-effort.
- Se o usuário limpar dados do site, os favoritos offline somem (mas o flag `is_pinned` no banco fica — reconciliação baixa de novo).
