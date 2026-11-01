/**
 * Curated browser entry point.
 *
 * Keep this surface limited to application workflows whose complete import
 * graph is browser-safe. Node configuration, logging, PDF generation and
 * persistence adapters belong to the server entry points.
 */
export {
  getBusinessProfile,
  saveBusinessProfile,
  type BusinessProfile,
  type BusinessProfileDeps,
  type BusinessRepository,
  type StoredBusiness,
} from "./business-profile.js";

export {
  createCustomer,
  getCustomer,
  listCustomers,
  updateCustomer,
  type Customer,
  type CustomerDeps,
  type CustomerRepository,
  type StoredCustomer,
  type UpdateCustomerInput,
} from "./customer.js";
