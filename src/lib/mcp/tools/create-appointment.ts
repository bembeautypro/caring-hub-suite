import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "create_appointment",
  title: "Criar compromisso",
  description:
    "Agenda uma nova consulta, exame ou compromisso de saúde para um familiar no Amparo.",
  inputSchema: {
    patient_id: z.string().describe("ID do familiar (use list_patients)."),
    title: z.string().describe("Título do compromisso."),
    type: z.string().describe("Tipo: consulta, exame, procedimento, vacina, terapia ou outro."),
    scheduled_at: z.string().describe("Data/hora ISO do compromisso."),
    specialty: z.string().optional(),
    doctor_name: z.string().optional(),
    location: z.string().optional(),
    notes: z.string().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    }
    const userId = ctx.getUserId();
    if (!userId) {
      return { content: [{ type: "text", text: "Usuário não identificado." }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("appointments")
      .insert({
        patient_id: input.patient_id,
        title: input.title,
        type: input.type,
        scheduled_at: input.scheduled_at,
        specialty: input.specialty ?? null,
        doctor_name: input.doctor_name ?? null,
        location: input.location ?? null,
        notes: input.notes ?? null,
        status: "scheduled",
        responsible_user_id: userId,
      })
      .select("id, title, type, scheduled_at, status")
      .single();

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { appointment: data },
    };
  },
});
