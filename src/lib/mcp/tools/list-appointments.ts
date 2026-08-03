import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_appointments",
  title: "Listar compromissos",
  description:
    "Lista consultas, exames e outros compromissos de saúde de um familiar no Amparo.",
  inputSchema: {
    patient_id: z.string().describe("ID do familiar (use list_patients)."),
    status: z.string().optional().describe("Filtro: scheduled, completed ou cancelled."),
    from: z.string().optional().describe("Data/hora ISO inicial para filtrar (ex.: 2026-08-01T00:00:00Z)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ patient_id, status, from }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("appointments")
      .select("id, title, type, specialty, scheduled_at, status, doctor_name, location, notes")
      .eq("patient_id", patient_id)
      .is("deleted_at", null)
      .order("scheduled_at", { ascending: true })
      .limit(100);
    if (status) query = query.eq("status", status);
    if (from) query = query.gte("scheduled_at", from);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { appointments: data ?? [] },
    };
  },
});
