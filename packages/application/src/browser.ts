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

export {
  createProduct,
  createSavedGstRate,
  getProduct,
  listProducts,
  listSavedGstRates,
  listTaxCategories,
  updateProduct,
  updateSavedGstRate,
  type Product,
  type ProductDeps,
  type ProductRepository,
  type SavedGstRate,
  type StoredProduct,
  type TaxCategory,
  type UpdateProductInput,
  type UpdateSavedGstRateInput,
} from "./product.js";

export {
  cancelDocument,
  createDocument,
  finalizeDocument,
  getDocument,
  listDocuments,
  saveNumberSeries,
  updateDocument,
  type BillingDocument,
  type DocumentDeps,
  type DocumentRepository,
  type NumberSeries,
  type SaveDocumentInput,
  type SaveNumberSeriesInput,
} from "./document.js";

export {
  getTemplate,
  listTemplates,
  reviseTemplate,
  setDefaultTemplate,
  type InvoiceTemplate,
  type TemplateBusiness,
  type TemplateDeps,
  type TemplateField,
  type TemplateCustomField,
  type TemplateRepository,
  type TemplateSection,
} from "./template.js";

export {
  previewTemplate,
  renderIssuedDocument,
  restoreTemplate,
  type IssuedRenderDeps,
  type TemplatePreviewDeps,
} from "./preview.js";

export {
  PAYMENT_METHODS, CustomerReceiptError, calculateUnallocatedCustomerAdvance,
  recordCustomerReceipt, listCustomerReceipts, getCustomerAdvance, renderCustomerReceipt,
  customerReceiptPrintLines,
  type CustomerReceipt, type CustomerReceiptDeps, type CustomerReceiptRepository, type PaymentMethod,
  type ReceiptIdentitySnapshot, type RecordCustomerReceiptInput,
} from "./customer-receipt.js";
export {
  AllocationError, allocateReceiptToInvoice, releaseReceiptAllocation, getInvoiceSettlement, getCustomerAllocatedTotal,
  type AllocationDeps, type AllocationEvent, type AllocationRepository, type InvoiceSettlement,
} from "./allocation.js";
export {
  PaymentAdjustmentError, recordCustomerRefund, reverseCustomerReceipt, reverseCustomerRefund, listReceiptAdjustments,
  type PaymentAdjustmentDeps, type PaymentAdjustmentEvent, type PaymentAdjustmentRepository,
  type PaymentAdjustmentTotals, type PaymentAdjustmentType,
} from "./payment-adjustment.js";
export {
  getCustomerPaymentActivity, CustomerPaymentActivityError,
  type CustomerPaymentActivity, type CustomerPaymentActivityDeps, type CustomerPaymentActivityEntry,
  type CustomerPaymentActivityRepository, type CustomerPaymentActivitySnapshot, type CustomerPaymentActivityType,
} from "./customer-payment-activity.js";
