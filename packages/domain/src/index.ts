/** Domain layer entry — billing/GST engines will live here in later milestones. */
export const DOMAIN_LAYER = "domain" as const;

export {
  INR_MINOR_SCALE,
  Money,
  MoneyError,
  Ratio,
  roundHalfUp,
} from "./money.js";
