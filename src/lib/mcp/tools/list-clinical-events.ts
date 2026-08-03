import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_clinical_events",
  title: "Listar histórico clínico",
  description:
    "Lista eventos do histórico clínico de um familiar no Amparo (diagnósticos, internações, sintomas etc.).",
  inputSchema: {
    patient_id: z.string().describe("ID do familiar (use list_patients)."),
    severity: z.string().optional().describe("Filtro de gravidade: low, medium, high ou critical."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ patient_id, severity }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("clinical_events")
      .select("id, title, type, severity, event_date, doctor_name, description, tags")
      .eq("patient_id", patient_id)
      .is("deleted_at", null)
      .order("event_date", { ascending: false })
      .limit(100);
    if (severity) query = query.eq("severity", severity);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { events: data ?? [] },
    };
  },
});
