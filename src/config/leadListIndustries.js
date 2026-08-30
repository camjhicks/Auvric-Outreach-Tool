// Lead Lists — the searchable business-type catalog for this module.
//
// Deliberately SEPARATE from src/config/niches.js (Lead Discovery's niche picker) so
// this module can search broadly across many industries without changing Lead
// Discovery's existing dropdown or behavior. Reuses the same SERVICE_FAMILIES /
// HIGH_TICKET_WEIGHT enums (single definition, no duplicate taxonomy).
//
// Economic logic matters more than the exact category: "big enough to afford a
// ~$2,300 website, small enough that the owner/manager controls the purchase."

import { SERVICE_FAMILIES, HIGH_TICKET_WEIGHT } from './niches.js'

const { HOME_SERVICES, PROPERTY_SERVICES, AUTOMOTIVE, HEALTH_AESTHETICS, PROFESSIONAL_SERVICES } = SERVICE_FAMILIES
const { LOW, MEDIUM, HIGH } = HIGH_TICKET_WEIGHT

export const ALL_INDUSTRIES_ID = 'all_qualified_niches'

export const LEAD_LIST_INDUSTRIES = Object.freeze([
  // Home services
  { id: 'hvac', label: 'HVAC', searchPhrase: 'HVAC companies', serviceFamily: HOME_SERVICES, highTicketWeight: HIGH },
  { id: 'roofing', label: 'Roofing', searchPhrase: 'roofing companies', serviceFamily: HOME_SERVICES, highTicketWeight: HIGH },
  { id: 'plumbing', label: 'Plumbing', searchPhrase: 'plumbing companies', serviceFamily: HOME_SERVICES, highTicketWeight: MEDIUM },
  { id: 'electrical', label: 'Electrical', searchPhrase: 'electricians', serviceFamily: HOME_SERVICES, highTicketWeight: MEDIUM },
  { id: 'solar', label: 'Solar', searchPhrase: 'solar installation companies', serviceFamily: HOME_SERVICES, highTicketWeight: HIGH },
  { id: 'water_damage_restoration', label: 'Water damage / restoration', searchPhrase: 'water damage restoration companies', serviceFamily: HOME_SERVICES, highTicketWeight: HIGH },
  { id: 'mold_remediation', label: 'Mold remediation', searchPhrase: 'mold remediation companies', serviceFamily: HOME_SERVICES, highTicketWeight: HIGH },
  { id: 'foundation_repair', label: 'Foundation repair', searchPhrase: 'foundation repair companies', serviceFamily: HOME_SERVICES, highTicketWeight: HIGH },
  { id: 'general_contractors', label: 'General contractors', searchPhrase: 'general contractors', serviceFamily: HOME_SERVICES, highTicketWeight: HIGH },
  { id: 'remodeling', label: 'Remodeling', searchPhrase: 'home remodeling companies', serviceFamily: HOME_SERVICES, highTicketWeight: HIGH },
  { id: 'kitchen_bath_remodeling', label: 'Kitchen & bath remodeling', searchPhrase: 'kitchen and bath remodeling companies', serviceFamily: HOME_SERVICES, highTicketWeight: HIGH },
  { id: 'pool_builders', label: 'Pool companies', searchPhrase: 'pool builders and pool service companies', serviceFamily: HOME_SERVICES, highTicketWeight: HIGH },
  { id: 'garage_door', label: 'Garage door companies', searchPhrase: 'garage door companies', serviceFamily: HOME_SERVICES, highTicketWeight: MEDIUM },
  { id: 'flooring', label: 'Flooring', searchPhrase: 'flooring companies', serviceFamily: HOME_SERVICES, highTicketWeight: MEDIUM },
  { id: 'concrete', label: 'Concrete', searchPhrase: 'concrete contractors', serviceFamily: HOME_SERVICES, highTicketWeight: MEDIUM },
  { id: 'windows_doors', label: 'Windows and doors', searchPhrase: 'window and door replacement companies', serviceFamily: HOME_SERVICES, highTicketWeight: MEDIUM },
  { id: 'painting', label: 'Painting', searchPhrase: 'painting contractors', serviceFamily: HOME_SERVICES, highTicketWeight: MEDIUM },

  // Property services
  { id: 'landscaping', label: 'Landscaping', searchPhrase: 'landscaping companies', serviceFamily: PROPERTY_SERVICES, highTicketWeight: MEDIUM },
  { id: 'tree_services', label: 'Tree services', searchPhrase: 'tree service companies', serviceFamily: PROPERTY_SERVICES, highTicketWeight: MEDIUM },
  { id: 'pest_control', label: 'Pest control', searchPhrase: 'pest control companies', serviceFamily: PROPERTY_SERVICES, highTicketWeight: MEDIUM },
  { id: 'fence_companies', label: 'Fence companies', searchPhrase: 'fence companies', serviceFamily: PROPERTY_SERVICES, highTicketWeight: MEDIUM },
  { id: 'commercial_cleaning', label: 'Commercial cleaning', searchPhrase: 'commercial cleaning companies', serviceFamily: PROPERTY_SERVICES, highTicketWeight: MEDIUM },
  { id: 'moving_companies', label: 'Moving companies', searchPhrase: 'moving companies', serviceFamily: PROPERTY_SERVICES, highTicketWeight: MEDIUM },
  { id: 'security_companies', label: 'Security companies', searchPhrase: 'security system installation companies', serviceFamily: PROPERTY_SERVICES, highTicketWeight: MEDIUM },
  { id: 'property_management', label: 'Property management', searchPhrase: 'property management companies', serviceFamily: PROPERTY_SERVICES, highTicketWeight: HIGH },

  // Automotive / private transportation
  { id: 'auto_body_collision', label: 'Auto body / collision repair', searchPhrase: 'auto body and collision repair shops', serviceFamily: AUTOMOTIVE, highTicketWeight: MEDIUM },
  { id: 'towing', label: 'Towing', searchPhrase: 'towing companies', serviceFamily: AUTOMOTIVE, highTicketWeight: LOW },
  { id: 'private_transportation', label: 'Private transportation / limo services', searchPhrase: 'private car service and limo companies', serviceFamily: AUTOMOTIVE, highTicketWeight: MEDIUM },
  { id: 'car_rental', label: 'Car rental', searchPhrase: 'car rental companies', serviceFamily: AUTOMOTIVE, highTicketWeight: MEDIUM },
  { id: 'exotic_car_rental', label: 'Luxury / exotic car rental', searchPhrase: 'exotic and luxury car rental companies', serviceFamily: AUTOMOTIVE, highTicketWeight: HIGH },

  // Health & aesthetics
  { id: 'dentists', label: 'Dentists', searchPhrase: 'dental practices', serviceFamily: HEALTH_AESTHETICS, highTicketWeight: MEDIUM },
  { id: 'cosmetic_dentistry', label: 'Cosmetic dentistry', searchPhrase: 'cosmetic dentistry practices', serviceFamily: HEALTH_AESTHETICS, highTicketWeight: HIGH },
  { id: 'orthodontics', label: 'Orthodontics', searchPhrase: 'orthodontic practices', serviceFamily: HEALTH_AESTHETICS, highTicketWeight: HIGH },
  { id: 'chiropractors', label: 'Chiropractors', searchPhrase: 'chiropractic clinics', serviceFamily: HEALTH_AESTHETICS, highTicketWeight: MEDIUM },
  { id: 'physical_therapy', label: 'Physical therapy', searchPhrase: 'physical therapy clinics', serviceFamily: HEALTH_AESTHETICS, highTicketWeight: MEDIUM },
  { id: 'med_spas', label: 'Med spas', searchPhrase: 'med spas', serviceFamily: HEALTH_AESTHETICS, highTicketWeight: HIGH },

  // Professional services
  { id: 'personal_injury_law', label: 'Personal injury law firms', searchPhrase: 'personal injury law firms', serviceFamily: PROFESSIONAL_SERVICES, highTicketWeight: HIGH },
  { id: 'accounting', label: 'Accounting', searchPhrase: 'accounting firms', serviceFamily: PROFESSIONAL_SERVICES, highTicketWeight: MEDIUM },
  { id: 'tax_companies', label: 'Tax companies', searchPhrase: 'tax preparation companies', serviceFamily: PROFESSIONAL_SERVICES, highTicketWeight: MEDIUM },
  { id: 'insurance_agencies', label: 'Insurance agencies', searchPhrase: 'independent insurance agencies', serviceFamily: PROFESSIONAL_SERVICES, highTicketWeight: MEDIUM },
  { id: 'real_estate_services', label: 'Real estate service companies', searchPhrase: 'real estate service companies', serviceFamily: PROFESSIONAL_SERVICES, highTicketWeight: MEDIUM },
  { id: 'event_venues', label: 'Event venues', searchPhrase: 'event venues', serviceFamily: PROFESSIONAL_SERVICES, highTicketWeight: HIGH },
  { id: 'wedding_businesses', label: 'Wedding businesses', searchPhrase: 'wedding planning and wedding venue businesses', serviceFamily: PROFESSIONAL_SERVICES, highTicketWeight: HIGH },
])

export function getIndustryById(id) {
  return LEAD_LIST_INDUSTRIES.find(i => i.id === id) ?? null
}

/** All industries, expanding the "All Qualified Niches" sentinel into the full list. */
export function resolveIndustrySelection(selectedIds) {
  const ids = Array.isArray(selectedIds) ? selectedIds : []
  if (ids.includes(ALL_INDUSTRIES_ID) || ids.length === 0) return LEAD_LIST_INDUSTRIES.slice()
  const set = new Set(ids)
  return LEAD_LIST_INDUSTRIES.filter(i => set.has(i.id))
}
