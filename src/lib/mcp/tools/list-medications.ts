import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_medications",
  title: "Listar medicamentos",
  description:
    "Lista os medicamentos de um familiar (paciente) no Amparo, com dosagem, frequência e horários.",
  inputSchema: {
    patient_id: z.string().describe("ID do familiar (use list_patients)."),
    status: z.string().optional().describe("Filtro de status: active, paused ou ended."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ patient_id, status }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("medications")
      .select("id, name, generic_name, dosage, frequency, schedule, status, start_date, end_date, prescribed_by")
      .eq("patient_id", patient_id)
      .is("deleted_at", null)
      .order("name");
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { medications: data ?? [] },
    };
  },
});
