/** Domain layer entry. The GST component engine arrives in a later milestone. */
export const DOMAIN_LAYER = "domain" as const;

export {
  INR_MINOR_SCALE,
  Money,
  MoneyError,
  Ratio,
  roundHalfUp,
} from "./money.js";
export {
  STATE_UTS,
  activeStateUts,
  findStateUtByGstStateCode,
  findStateUtById,
  type StateUt,
  type StateUtType,
} from "./state-ut.js";
export {
  BusinessProfileError,
  validateBusinessInput,
  type NormalizedBusinessInput,
  type SaveBusinessProfileInput,
} from "./business-profile.js";
export {
  CUSTOMER_REGISTRATION_TYPES,
  CustomerError,
  validateCustomerInput,
  type CustomerRegistrationType,
  type NormalizedCustomerInput,
  type SaveCustomerInput,
} from "./customer.js";
export { GstinError, gstinCheckCharacter } from "./gstin.js";
export {
  PRODUCT_TYPES,
  ProductError,
  TAX_CATEGORIES,
  validateProductInput,
  validateSavedGstRate,
  type NormalizedProductInput,
  type NormalizedSavedGstRate,
  type ProductType,
  type SaveProductInput,
  type SaveSavedGstRateInput,
  type TaxCategoryId,
} from "./product.js";
export {
  DOCUMENT_TYPES,
  BillingError,
  assertDocumentGstMode,
  assertFinancialYearLabel,
  calculateDocument,
  defaultDocumentPrefix,
  financialYearOf,
  formatDocumentNumber,
  normalizeSeriesPrefix,
  type CalculatedCharge,
  type CalculatedLine,
  type ChargeInput,
  type DiscountType,
  type DocumentCalculation,
  type DocumentCalculationInput,
  type DocumentType,
  type LineInput,
} from "./billing.js";
