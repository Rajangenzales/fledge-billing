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
  seriesId,
  updateDocument,
  type BillingDocument,
  type BusinessRef,
  type CustomerRef,
  type DocumentCustomField,
  type DocumentCharge,
  type DocumentDeps,
  type DocumentLine,
  type DocumentRepository,
  type DocumentStatus,
  type DocumentTax,
  type NumberSeries,
  type ProductRef,
  type SaveDocumentInput,
  type SaveNumberSeriesInput,
} from "./document.js";
export {
  PREVIEW_DATE,
  previewTemplate,
  renderIssuedDocument,
  restoreTemplate,
  type IssuedRenderDeps,
  type TemplatePreviewDeps,
} from "./preview.js";
export {
  getTemplate,
  listTemplates,
  reviseTemplate,
  setDefaultTemplate,
  type InvoiceTemplate,
  type TemplateDeps,
  type TemplateField,
  type TemplateCustomField,
  type TemplateRepository,
  type TemplateSection,
} from "./template.js";
export {
  exportInvoicePdf,
  printInvoice,
  shareInvoicePdf,
} from "./export.js";
export { buildInvoicePdf } from "./pdf.js";
export { buildCustomerReceiptPdf } from "./customer-receipt-pdf.js";
export { exportCustomerReceiptPdf } from "./customer-receipt-export.js";
export { loadConfig, type AppConfig } from "./config.js";
export { AppError, toUserFacingMessage, type ErrorCode } from "./errors.js";
export { createLogger, type Logger } from "./logger.js";

export {
  PAYMENT_METHODS,
  CustomerReceiptError,
  recordCustomerReceipt,
  listCustomerReceipts,
  getCustomerAdvance,
  renderCustomerReceipt,
  customerReceiptPrintLines,
  printCustomerReceipt,
  type CustomerReceipt,
  type CustomerReceiptDeps,
  type CustomerReceiptRepository,
  type PaymentMethod,
  type ReceiptIdentitySnapshot,
  type PrintableCustomerReceipt,
  type RecordCustomerReceiptInput,
} from "./customer-receipt.js";

export {
  AllocationError,
  allocateReceiptToInvoice,
  releaseReceiptAllocation,
  getInvoiceSettlement,
  getCustomerAllocatedTotal,
  type AllocationDeps,
  type AllocationEvent,
  type AllocationRepository,
  type InvoiceSettlement,
} from "./allocation.js";

export {
  PaymentAdjustmentError,
  recordCustomerRefund,
  reverseCustomerReceipt,
  reverseCustomerRefund,
  listReceiptAdjustments,
  type PaymentAdjustmentDeps,
  type PaymentAdjustmentEvent,
  type PaymentAdjustmentRepository,
  type PaymentAdjustmentTotals,
  type PaymentAdjustmentType,
} from "./payment-adjustment.js";
