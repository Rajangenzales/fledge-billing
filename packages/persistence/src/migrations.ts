import { billingDocument } from "./document.js";
import { gstEngine } from "./gst.js";
import { businessProfile } from "./business.js";
import { customerMaster } from "./customer.js";
import type { Migration } from "./migrate.js";
import { productService } from "./product.js";
import { customField } from "./custom-field.js";
import { invoiceTemplate } from "./template.js";
import { stateUtMaster } from "./state-ut.js";

/** Schema changes shipped with this application build. */
export const migrations: readonly Migration[] = [
  stateUtMaster,
  businessProfile,
  customerMaster,
  productService,
  billingDocument,
  gstEngine,
  invoiceTemplate,
  customField,
];
