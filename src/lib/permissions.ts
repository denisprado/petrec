export type Role =
  | "owner"
  | "co_owner"
  | "caregiver"
  | "viewer"
  | "vet_limited"
  | "clinic_admin"
  | "caregiver_pro";

export interface PermissionCheck {
  canEditPet: boolean;
  canManageMembers: boolean;
  canDeletePet: boolean;
  canManageMedications: boolean;
  canAdministerMedications: boolean;
  canManageInventory: boolean;
  canRegisterConsumption: boolean;
  canRegisterPurchases: boolean;
  canManageVaccinations: boolean;
  canManageAppointments: boolean;
  canViewOnly: boolean;
  // Permissões Clínicas e de Privacidade
  canViewClinicalNotes: boolean;
  canAddClinicalNotes: boolean;
  canViewPrivateVetNotes: boolean;
  canPrescribe: boolean;
  canApprovePrescriptions: boolean;
  canViewFinancials: boolean;
  isProfessional: boolean;
  professionalRoleLabel: string;
}

export function getRolePermissions(role: string): PermissionCheck {
  const normalized = role.toLowerCase() as Role;

  switch (normalized) {
    case "owner":
      return {
        canEditPet: true,
        canManageMembers: true,
        canDeletePet: true,
        canManageMedications: true,
        canAdministerMedications: true,
        canManageInventory: true,
        canRegisterConsumption: true,
        canRegisterPurchases: true,
        canManageVaccinations: true,
        canManageAppointments: true,
        canViewOnly: false,
        canViewClinicalNotes: true,
        canAddClinicalNotes: true,
        canViewPrivateVetNotes: false, // Notas técnicas vet-to-vet são protegidas
        canPrescribe: true,
        canApprovePrescriptions: true,
        canViewFinancials: true,
        isProfessional: false,
        professionalRoleLabel: "Proprietário",
      };

    case "co_owner":
      return {
        canEditPet: true,
        canManageMembers: false,
        canDeletePet: false,
        canManageMedications: true,
        canAdministerMedications: true,
        canManageInventory: true,
        canRegisterConsumption: true,
        canRegisterPurchases: true,
        canManageVaccinations: true,
        canManageAppointments: true,
        canViewOnly: false,
        canViewClinicalNotes: true,
        canAddClinicalNotes: true,
        canViewPrivateVetNotes: false,
        canPrescribe: true,
        canApprovePrescriptions: true,
        canViewFinancials: true,
        isProfessional: false,
        professionalRoleLabel: "Coproprietária",
      };

    case "caregiver":
      return {
        canEditPet: false,
        canManageMembers: false,
        canDeletePet: false,
        canManageMedications: false,
        canAdministerMedications: true,
        canManageInventory: false,
        canRegisterConsumption: true,
        canRegisterPurchases: false,
        canManageVaccinations: false,
        canManageAppointments: false,
        canViewOnly: false,
        canViewClinicalNotes: true,
        canAddClinicalNotes: false,
        canViewPrivateVetNotes: false,
        canPrescribe: false,
        canApprovePrescriptions: false,
        canViewFinancials: false,
        isProfessional: false,
        professionalRoleLabel: "Cuidador",
      };

    case "vet_limited":
      return {
        canEditPet: false,
        canManageMembers: false,
        canDeletePet: false,
        canManageMedications: true, // pode sugerir prescrições
        canAdministerMedications: true,
        canManageInventory: false, // não mexe no estoque de ração do tutor
        canRegisterConsumption: false,
        canRegisterPurchases: false, // financeiro bloqueado por privacidade
        canManageVaccinations: true, // pode lançar vacinas com CRMV
        canManageAppointments: true,
        canViewOnly: false,
        canViewClinicalNotes: true,
        canAddClinicalNotes: true,
        canViewPrivateVetNotes: true, // vê anotações técnicas inter-veterinárias
        canPrescribe: true,
        canApprovePrescriptions: false, // aprovação cabe ao tutor
        canViewFinancials: false, // privacidade financeira dos tutores
        isProfessional: true,
        professionalRoleLabel: "Médico Veterinário",
      };

    case "clinic_admin":
      return {
        canEditPet: false,
        canManageMembers: false,
        canDeletePet: false,
        canManageMedications: false,
        canAdministerMedications: false,
        canManageInventory: false,
        canRegisterConsumption: false,
        canRegisterPurchases: false,
        canManageVaccinations: false,
        canManageAppointments: true, // pode agendar consultas/procedimentos
        canViewOnly: false,
        canViewClinicalNotes: true,
        canAddClinicalNotes: false,
        canViewPrivateVetNotes: false,
        canPrescribe: false,
        canApprovePrescriptions: false,
        canViewFinancials: false,
        isProfessional: true,
        professionalRoleLabel: "Clínica / Recepção",
      };

    case "caregiver_pro":
      return {
        canEditPet: false,
        canManageMembers: false,
        canDeletePet: false,
        canManageMedications: false,
        canAdministerMedications: true, // pode dar dose durante hospedagem/passeio
        canManageInventory: false,
        canRegisterConsumption: true, // registra refeição e passeios
        canRegisterPurchases: false,
        canManageVaccinations: false,
        canManageAppointments: false,
        canViewOnly: false,
        canViewClinicalNotes: true, // vê restrições de saúde
        canAddClinicalNotes: false,
        canViewPrivateVetNotes: false,
        canPrescribe: false,
        canApprovePrescriptions: false,
        canViewFinancials: false,
        isProfessional: true,
        professionalRoleLabel: "Pet Sitter / Adestrador",
      };

    case "viewer":
    default:
      return {
        canEditPet: false,
        canManageMembers: false,
        canDeletePet: false,
        canManageMedications: false,
        canAdministerMedications: false,
        canManageInventory: false,
        canRegisterConsumption: false,
        canRegisterPurchases: false,
        canManageVaccinations: false,
        canManageAppointments: false,
        canViewOnly: true,
        canViewClinicalNotes: true,
        canAddClinicalNotes: false,
        canViewPrivateVetNotes: false,
        canPrescribe: false,
        canApprovePrescriptions: false,
        canViewFinancials: false,
        isProfessional: false,
        professionalRoleLabel: "Visitante",
      };
  }
}
