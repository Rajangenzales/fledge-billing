/**
 * Build-time contract entry for the curated application browser surface.
 *
 * Vite builds this as a separate entry so the dependency guard can inspect
 * the complete exported use-case graph even before the UI consumes it.
 */
export {
  getBusinessProfile,
  saveBusinessProfile,
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
} from "@fledge/application/browser";
