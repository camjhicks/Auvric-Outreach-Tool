// Lead Lists — Phone / decision-maker reachability. Pure, deterministic, evidence-only.
//
// Never claims a number IS the owner's personal line ("OWNER NUMBER") — only that the
// evidence makes an owner-likely, local, independently-operated business PLAUSIBLE
// ("OWNER-LIKELY"). Signals reused from what the app already computes for other
// purposes (toll-free detection, chain-risk level, estimated location count) — no new
// data source, no new API cost.

import { PHONE_REACHABILITY_TYPE } from '../config/leadListIntent.js'
import { TOLL_FREE_AREA_CODES, LOCATION_COUNT_IDEAL_MAX, LOCATION_COUNT_STILL_QUALIFIES_MAX } from '../config/leadListQualification.js'
import { CHAIN_RISK_LEVELS } from '../config/qualification.js'
import { normalizePhoneDigits } from './leadIdentity.js'

export function isTollFree(phone) {
  const digits = normalizePhoneDigits(phone)
  return digits ? TOLL_FREE_AREA_CODES.includes(digits.slice(0, 3)) : false
}

/**
 * @param {object} candidate — phone, locationCountEstimate, chainRiskLevel
 * @returns {{ score: number, type: string, gatekeeperRisk: boolean, evidence: string }}
 */
export function classifyPhoneReachability(candidate) {
  const digits = normalizePhoneDigits(candidate.phone)
  const tollFree = isTollFree(candidate.phone)
  const locCount = candidate.locationCountEstimate ?? 1
  const chainLevel = candidate.chainRiskLevel ?? CHAIN_RISK_LEVELS.UNKNOWN

  if (!digits) {
    return { score: 0, type: PHONE_REACHABILITY_TYPE.CENTRALIZED_REJECT, gatekeeperRisk: true, evidence: 'no phone number on file' }
  }

  let score = 0
  const notes = []
  if (!tollFree) { score += 40; notes.push('local (non-toll-free) number') } else { notes.push('toll-free number') }
  if (locCount <= LOCATION_COUNT_IDEAL_MAX) { score += 30; notes.push(`${locCount} estimated location${locCount === 1 ? '' : 's'}`) }
  else if (locCount <= LOCATION_COUNT_STILL_QUALIFIES_MAX) { score += 12; notes.push(`${locCount} estimated locations`) }
  if (chainLevel === CHAIN_RISK_LEVELS.LOW || chainLevel === CHAIN_RISK_LEVELS.UNKNOWN) { score += 20 }
  else if (chainLevel === CHAIN_RISK_LEVELS.MEDIUM) { notes.push('possible franchise/chain wording') }
  if (!tollFree && locCount <= LOCATION_COUNT_IDEAL_MAX) { score += 10 } // direct-line bonus, small independent footprint

  score = Math.max(0, Math.min(100, score))

  // Strong centralized evidence: toll-free AND (recognized chain brand OR too many
  // locations for the hard-reject threshold to have already caught it via a non-brand
  // path) — this candidate would normally already be hard-rejected upstream by the
  // existing chain/location-count rules, so reaching here with this combination is rare,
  // but classified honestly if it does. Never rejects on toll-free alone (§ many owners
  // legitimately answer their own main line).
  if (tollFree && chainLevel === CHAIN_RISK_LEVELS.HIGH) {
    return { score: 0, type: PHONE_REACHABILITY_TYPE.CENTRALIZED_REJECT, gatekeeperRisk: true, evidence: `toll-free number + recognized chain/franchise brand — ${notes.join(', ')}` }
  }

  const chainFlagged = chainLevel === CHAIN_RISK_LEVELS.MEDIUM || chainLevel === CHAIN_RISK_LEVELS.HIGH
  let type
  if (!tollFree && locCount <= LOCATION_COUNT_IDEAL_MAX && !chainFlagged) {
    type = PHONE_REACHABILITY_TYPE.DIRECT_OWNER_LIKELY
  } else if (!tollFree && locCount <= LOCATION_COUNT_STILL_QUALIFIES_MAX && !chainFlagged) {
    type = PHONE_REACHABILITY_TYPE.LOCAL_BUSINESS_LINE
  } else {
    type = PHONE_REACHABILITY_TYPE.GATEKEEPER_RISK
  }
  const gatekeeperRisk = type === PHONE_REACHABILITY_TYPE.GATEKEEPER_RISK || type === PHONE_REACHABILITY_TYPE.CENTRALIZED_REJECT

  return { score, type, gatekeeperRisk, evidence: notes.join(', ') }
}
