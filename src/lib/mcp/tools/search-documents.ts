import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "search_documents",
  title: "Buscar documentos",
  description:
    "Busca documentos médicos de um familiar no Amparo por título, instituição ou médico. Retorna apenas metadados, nunca o arquivo.",
  inputSchema: {
    patient_id: z.string().describe("ID do familiar (use list_patients)."),
    query: z.string().optional().describe("Termo de busca livre."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ patient_id, query }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let request = supabase
      .from("documents")
      .select("id, title, type, document_date, institution, doctor_name, tags, expiry_date")
      .eq("patient_id", patient_id)
      .is("deleted_at", null)
      .order("document_date", { ascending: false })
      .limit(50);

    const term = query?.trim();
    if (term) {
      request = request.textSearch("search_vector", term, {
        type: "websearch",
        config: "portuguese",
      });
    }

    const { data, error } = await request;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { documents: data ?? [] },
    };
  },
});
