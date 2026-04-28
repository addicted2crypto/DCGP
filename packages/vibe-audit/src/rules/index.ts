/**
 * BUILTIN_RULES - the v1 rule registry.
 *
 * Order matters for output stability: severity descending, then alpha by id.
 * Tests pin against this order so accidental reorderings show up.
 */

import type { Rule } from "../types";

import { hardcodedCredentialsRule } from "./hardcoded-credentials";
import { commandInjectionRule } from "./command-injection";
import { predictableRandomnessRule } from "./predictable-randomness";
import { testTheaterRule } from "./test-theater";
import { typeSafetyBypassesRule } from "./type-safety-bypasses";
import { regexRedosRiskRule } from "./regex-redos-risk";
import { stubMarkersRule } from "./stub-markers";
import { commentDensityRule } from "./comment-density";

export const BUILTIN_RULES: readonly Rule[] = [
  hardcodedCredentialsRule, // critical
  commandInjectionRule, // error
  predictableRandomnessRule, // error
  testTheaterRule, // error
  typeSafetyBypassesRule, // warn
  regexRedosRiskRule, // warn
  stubMarkersRule, // warn
  commentDensityRule, // info
];

export {
  hardcodedCredentialsRule,
  commandInjectionRule,
  predictableRandomnessRule,
  testTheaterRule,
  typeSafetyBypassesRule,
  regexRedosRiskRule,
  stubMarkersRule,
  commentDensityRule,
};
