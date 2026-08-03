import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listPatients from "./tools/list-patients";
import listMedications from "./tools/list-medications";
import listAppointments from "./tools/list-appointments";
import listClinicalEvents from "./tools/list-clinical-events";
import searchDocuments from "./tools/search-documents";
import createAppointment from "./tools/create-appointment";

const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "family-care-hub",
  title: "Family Care Hub",
  version: "0.1.0",
  instructions:
    "Ferramentas do Amparo (Family Care Hub) para coordenação de saúde familiar. Comece por `list_patients` para obter o ID do familiar e use-o nas demais ferramentas. Todos os dados são restritos ao usuário autenticado.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listPatients,
    listMedications,
    listAppointments,
    listClinicalEvents,
    searchDocuments,
    createAppointment,
  ],
});
