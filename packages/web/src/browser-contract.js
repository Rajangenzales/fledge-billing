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
  createProduct,
  createSavedGstRate,
  getProduct,
  listProducts,
  listSavedGstRates,
  listTaxCategories,
  updateProduct,
  updateSavedGstRate,
  cancelDocument,
  createDocument,
  finalizeDocument,
  getDocument,
  listDocuments,
  saveNumberSeries,
  updateDocument,
  getTemplate,
  listTemplates,
  reviseTemplate,
  setDefaultTemplate,
  previewTemplate,
  renderIssuedDocument,
  restoreTemplate,
} from "@fledge/application/browser";
