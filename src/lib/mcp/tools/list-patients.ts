import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_patients",
  title: "Listar familiares",
  description:
    "Lista os familiares (pacientes) que o usuário autenticado acompanha no Amparo, com dados básicos de saúde.",
  inputSchema: { limit: z.number().int().optional().describe("Máximo de registros (padrão 20).") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("patients")
      .select("id, name, birth_date, blood_type, health_insurance_name, preferred_hospital")
      .is("deleted_at", null)
      .order("name")
      .limit(Math.min(Math.max(limit ?? 20, 1), 100));

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { patients: data ?? [] },
    };
  },
});
