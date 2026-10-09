import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
    avatar: v.optional(v.string()),
    whatsappPhoneNumber: v.optional(v.string()),
    whatsappVerifiedAt: v.optional(v.number()),
    timezone: v.optional(v.string()),
  })
    .index("by_email", ["email"])
    .index("by_whatsapp", ["whatsappPhoneNumber"]),

  pets: defineTable({
    name: v.string(),
    species: v.string(), // "Cão", "Gato", etc.
    breed: v.optional(v.string()),
    sex: v.optional(v.string()),
    birthDate: v.optional(v.string()),
    weight: v.optional(v.number()),
    photo: v.optional(v.string()),
    color: v.optional(v.string()),
    microchip: v.optional(v.string()),
    notes: v.optional(v.string()),
  }),

  petMembers: defineTable({
    petId: v.id("pets"),
    userId: v.id("users"),
    role: v.string(), // "owner", "co_owner", "caregiver", "viewer", "vet_limited", "clinic_admin", "caregiver_pro"
    isPrimary: v.boolean(),
    professionalType: v.optional(v.string()),
    crmv: v.optional(v.string()),
    specialties: v.optional(v.string()),
  })
    .index("by_pet", ["petId"])
    .index("by_user", ["userId"])
    .index("by_pet_and_user", ["petId", "userId"]),

  medications: defineTable({
    petId: v.id("pets"),
    name: v.string(),
    activeIngredient: v.optional(v.string()),
    presentation: v.optional(v.string()),
    dosage: v.optional(v.string()),
    unit: v.optional(v.string()),
    instructions: v.optional(v.string()),
    veterinarian: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    status: v.string(), // "active", "pending_tutor_approval", "rejected"
    prescribedById: v.optional(v.id("users")),
    approvedById: v.optional(v.id("users")),
    approvedAt: v.optional(v.number()),
    notes: v.optional(v.string()),
  }).index("by_pet", ["petId"]),

  medicationSchedules: defineTable({
    medicationId: v.id("medications"),
    quantityPerAdministration: v.number(),
    administrationsPerDay: v.number(),
    frequency: v.string(),
    times: v.array(v.string()), // ex: ["08:00", "20:00"]
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    active: v.boolean(),
  }).index("by_medication", ["medicationId"]),

  medicationAdministrations: defineTable({
    medicationId: v.id("medications"),
    petId: v.id("pets"),
    scheduledAt: v.string(),
    administeredAt: v.optional(v.string()),
    administeredByUserId: v.optional(v.id("users")),
    quantity: v.number(),
    status: v.string(), // "scheduled", "administered", "skipped", "missed"
    notes: v.optional(v.string()),
  })
    .index("by_pet", ["petId"])
    .index("by_medication", ["medicationId"]),

  inventoryItems: defineTable({
    petId: v.id("pets"),
    medicationId: v.optional(v.id("medications")),
    name: v.string(),
    category: v.string(), // "racao", "medicamento", "petisco", etc.
    unit: v.string(),
    currentQuantity: v.number(),
    dailyConsumption: v.number(),
    purchaseLeadTimeDays: v.number(),
    referenceDate: v.string(),
    estimatedEndDate: v.optional(v.string()),
    status: v.string(), // "OK", "ATENÇÃO", "COMPRAR AGORA", "SEM ESTOQUE", "ESTOQUE INSUFICIENTE"
    notes: v.optional(v.string()),
  })
    .index("by_pet", ["petId"])
    .index("by_medication", ["medicationId"]),

  inventoryTransactions: defineTable({
    inventoryItemId: v.id("inventoryItems"),
    type: v.string(), // "purchase", "consumption", "adjustment", etc.
    quantity: v.number(),
    unitPrice: v.optional(v.number()),
    totalPrice: v.optional(v.number()),
    date: v.string(),
    userId: v.optional(v.id("users")),
    notes: v.optional(v.string()),
  }).index("by_item", ["inventoryItemId"]),

  purchases: defineTable({
    petId: v.id("pets"),
    userId: v.id("users"),
    date: v.string(),
    supplier: v.optional(v.string()),
    total: v.number(),
    notes: v.optional(v.string()),
  }).index("by_pet", ["petId"]),

  purchaseItems: defineTable({
    purchaseId: v.id("purchases"),
    inventoryItemId: v.id("inventoryItems"),
    quantity: v.number(),
    unitPrice: v.number(),
    total: v.number(),
  }).index("by_purchase", ["purchaseId"]),

  shoppingListItems: defineTable({
    petId: v.id("pets"),
    inventoryItemId: v.optional(v.id("inventoryItems")),
    customName: v.optional(v.string()),
    quantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    isPurchased: v.boolean(),
    purchasedAt: v.optional(v.string()),
    purchasedByUserId: v.optional(v.id("users")),
  }).index("by_pet", ["petId"]),

  weightRecords: defineTable({
    petId: v.id("pets"),
    weight: v.number(),
    date: v.string(),
    notes: v.optional(v.string()),
  }).index("by_pet", ["petId"]),

  vaccinations: defineTable({
    petId: v.id("pets"),
    name: v.string(),
    applicationDate: v.string(),
    nextDueDate: v.optional(v.string()),
    veterinarian: v.optional(v.string()),
    crmv: v.optional(v.string()),
    batch: v.optional(v.string()),
    notes: v.optional(v.string()),
  }).index("by_pet", ["petId"]),

  appointments: defineTable({
    petId: v.id("pets"),
    title: v.string(),
    type: v.string(),
    date: v.string(),
    time: v.string(),
    veterinarian: v.optional(v.string()),
    location: v.optional(v.string()),
    notes: v.optional(v.string()),
  }).index("by_pet", ["petId"]),

  healthEvents: defineTable({
    petId: v.id("pets"),
    type: v.string(),
    title: v.string(),
    date: v.string(),
    description: v.optional(v.string()),
    veterinarian: v.optional(v.string()),
    attachments: v.optional(v.string()),
    userId: v.optional(v.id("users")),
  }).index("by_pet", ["petId"]),

  clinicalNotes: defineTable({
    petId: v.id("pets"),
    authorId: v.id("users"),
    content: v.string(),
    visibility: v.string(), // "ALL_TUTORS", "VET_ONLY"
    appointmentId: v.optional(v.string()),
  }).index("by_pet", ["petId"]),

  whatsappSessions: defineTable({
    userId: v.id("users"),
    currentPetId: v.optional(v.id("pets")),
    state: v.string(),
    pendingActionPayload: v.optional(v.string()),
  }).index("by_user", ["userId"]),

  whatsappPairingTokens: defineTable({
    userId: v.id("users"),
    token: v.string(),
    expiresAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_user", ["userId"]),

  activityLogs: defineTable({
    petId: v.id("pets"),
    userId: v.optional(v.id("users")),
    action: v.string(),
    entityType: v.string(),
    entityId: v.optional(v.string()),
    metadata: v.optional(v.string()),
  }).index("by_pet", ["petId"]),

  whatsappWebhookLogs: defineTable({
    from: v.string(),
    messageText: v.string(),
    replyText: v.string(),
    status: v.string(), // "SUCCESS", "META_ERROR", "CONFIG_MISSING"
    metaError: v.optional(v.string()),
    timestamp: v.number(),
  }).index("by_timestamp", ["timestamp"]),
});
