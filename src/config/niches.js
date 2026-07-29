// Centralized niche configuration for Auvric Scout's universal lead discovery.
//
// This is the single source of truth for which local-service niches Scout can
// search. Discovery logic reads from here — adding a niche means adding one row
// to NICHES below, with no changes to components or the request flow.

// Valid service families. A niche's serviceFamily MUST be one of these.
export const SERVICE_FAMILIES = Object.freeze({
  HOME_SERVICES: 'home_services',
  PROPERTY_SERVICES: 'property_services',
  AUTOMOTIVE: 'automotive',
  HEALTH_AESTHETICS: 'health_aesthetics',
  PROFESSIONAL_SERVICES: 'professional_services',
})
export const VALID_SERVICE_FAMILIES = Object.freeze(Object.values(SERVICE_FAMILIES))

// High-ticket weighting (relative deal value of a niche). A later milestone
// (15A2 Qualification Engine) will use this; for now it is carried as metadata.
export const HIGH_TICKET_WEIGHT = Object.freeze({ LOW: 1, MEDIUM: 2, HIGH: 3 })
export const VALID_HIGH_TICKET_WEIGHTS = Object.freeze(Object.values(HIGH_TICKET_WEIGHT))

// Sentinel id for a user-supplied custom search phrase (not a fixed niche).
export const CUSTOM_NICHE_ID = 'custom'

const { HOME_SERVICES, PROPERTY_SERVICES, AUTOMOTIVE, HEALTH_AESTHETICS, PROFESSIONAL_SERVICES } = SERVICE_FAMILIES
const { LOW, MEDIUM, HIGH } = HIGH_TICKET_WEIGHT

// The supported niches. HVAC is included but is NOT the default or primary.
export const NICHES = Object.freeze([
  { id: 'hvac', label: 'HVAC', searchPhrase: 'HVAC companies', serviceFamily: HOME_SERVICES, highTicketWeight: HIGH, enabled: true },
  { id: 'roofing', label: 'Roofing', searchPhrase: 'roofing companies', serviceFamily: HOME_SERVICES, highTicketWeight: HIGH, enabled: true },
  { id: 'plumbing', label: 'Plumbing', searchPhrase: 'plumbing companies', serviceFamily: HOME_SERVICES, highTicketWeight: MEDIUM, enabled: true },
  { id: 'electrical', label: 'Electrical', searchPhrase: 'electricians', serviceFamily: HOME_SERVICES, highTicketWeight: MEDIUM, enabled: true },
  { id: 'foundation_repair', label: 'Foundation repair', searchPhrase: 'foundation repair companies', serviceFamily: HOME_SERVICES, highTicketWeight: HIGH, enabled: true },
  { id: 'concrete', label: 'Concrete', searchPhrase: 'concrete contractors', serviceFamily: HOME_SERVICES, highTicketWeight: MEDIUM, enabled: true },
  { id: 'garage_door', label: 'Garage door companies', searchPhrase: 'garage door companies', serviceFamily: HOME_SERVICES, highTicketWeight: MEDIUM, enabled: true },
  { id: 'kitchen_bath_remodeling', label: 'Kitchen & bath remodeling', searchPhrase: 'kitchen and bath remodeling companies', serviceFamily: HOME_SERVICES, highTicketWeight: HIGH, enabled: true },
  { id: 'epoxy_flooring', label: 'Epoxy flooring', searchPhrase: 'epoxy flooring companies', serviceFamily: HOME_SERVICES, highTicketWeight: MEDIUM, enabled: true },
  { id: 'pool_builders', label: 'Pool builders', searchPhrase: 'pool builders', serviceFamily: HOME_SERVICES, highTicketWeight: HIGH, enabled: true },

  { id: 'landscaping', label: 'Landscaping', searchPhrase: 'landscaping companies', serviceFamily: PROPERTY_SERVICES, highTicketWeight: MEDIUM, enabled: true },
  { id: 'tree_services', label: 'Tree services', searchPhrase: 'tree service companies', serviceFamily: PROPERTY_SERVICES, highTicketWeight: MEDIUM, enabled: true },
  { id: 'pest_control', label: 'Pest control', searchPhrase: 'pest control companies', serviceFamily: PROPERTY_SERVICES, highTicketWeight: MEDIUM, enabled: true },
  { id: 'fence_companies', label: 'Fence companies', searchPhrase: 'fence companies', serviceFamily: PROPERTY_SERVICES, highTicketWeight: MEDIUM, enabled: true },
  { id: 'pressure_washing', label: 'Pressure washing', searchPhrase: 'pressure washing services', serviceFamily: PROPERTY_SERVICES, highTicketWeight: LOW, enabled: true },
  { id: 'junk_removal', label: 'Junk removal', searchPhrase: 'junk removal services', serviceFamily: PROPERTY_SERVICES, highTicketWeight: LOW, enabled: true },
  { id: 'commercial_cleaning', label: 'Commercial cleaning', searchPhrase: 'commercial cleaning companies', serviceFamily: PROPERTY_SERVICES, highTicketWeight: MEDIUM, enabled: true },

  { id: 'auto_body', label: 'Auto body shops', searchPhrase: 'auto body shops', serviceFamily: AUTOMOTIVE, highTicketWeight: MEDIUM, enabled: true },
  { id: 'window_tinting', label: 'Window tinting', searchPhrase: 'window tinting shops', serviceFamily: AUTOMOTIVE, highTicketWeight: LOW, enabled: true },
  { id: 'mobile_detailing', label: 'Mobile detailing', searchPhrase: 'mobile detailing services', serviceFamily: AUTOMOTIVE, highTicketWeight: LOW, enabled: true },

  { id: 'med_spas', label: 'Med spas', searchPhrase: 'med spas', serviceFamily: HEALTH_AESTHETICS, highTicketWeight: HIGH, enabled: true },
  { id: 'cosmetic_dentistry', label: 'Cosmetic dentistry', searchPhrase: 'cosmetic dentistry practices', serviceFamily: HEALTH_AESTHETICS, highTicketWeight: HIGH, enabled: true },

  { id: 'personal_injury_law', label: 'Personal injury law firms', searchPhrase: 'personal injury law firms', serviceFamily: PROFESSIONAL_SERVICES, highTicketWeight: HIGH, enabled: true },
])

export function getEnabledNiches() {
  return NICHES.filter(n => n.enabled)
}

export function getNicheById(id) {
  return NICHES.find(n => n.id === id) ?? null
}

export function isValidServiceFamily(family) {
  return VALID_SERVICE_FAMILIES.includes(family)
}

export function isValidHighTicketWeight(weight) {
  return VALID_HIGH_TICKET_WEIGHTS.includes(weight)
}

/**
 * Resolve the search context for a discovery request from a selected niche id
 * and an optional custom phrase. Returns a neutral, provider-agnostic context.
 *
 * @param {string|null} nicheId  a NICHES id, CUSTOM_NICHE_ID, or null
 * @param {string} customPhrase  free-text phrase used when nicheId === CUSTOM_NICHE_ID
 * @returns {{
 *   searchPhrase: string,
 *   selectedNicheId: string|null,
 *   selectedNicheLabel: string|null,
 *   selectedNicheSearchPhrase: string|null,
 *   serviceFamily: string|null,
 *   highTicketWeight: number|null,
 * } | null}  null when nothing usable is selected/entered
 */
export function resolveNicheSearch(nicheId, customPhrase = '') {
  if (nicheId === CUSTOM_NICHE_ID) {
    const phrase = (customPhrase ?? '').trim()
    if (!phrase) return null
    return {
      searchPhrase: phrase,
      selectedNicheId: CUSTOM_NICHE_ID,
      selectedNicheLabel: 'Custom',
      selectedNicheSearchPhrase: phrase,
      serviceFamily: null,
      highTicketWeight: null,
    }
  }
  const niche = getNicheById(nicheId)
  if (!niche) return null
  return {
    searchPhrase: niche.searchPhrase,
    selectedNicheId: niche.id,
    selectedNicheLabel: niche.label,
    selectedNicheSearchPhrase: niche.searchPhrase,
    serviceFamily: niche.serviceFamily,
    highTicketWeight: niche.highTicketWeight,
  }
}
