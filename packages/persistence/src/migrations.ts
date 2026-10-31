import { businessProfile } from "./business.js";
import { customerMaster } from "./customer.js";
import type { Migration } from "./migrate.js";
import { productService } from "./product.js";
import { stateUtMaster } from "./state-ut.js";

/** Schema changes shipped with this application build. */
export const migrations: readonly Migration[] = [
  stateUtMaster,
  businessProfile,
  customerMaster,
  productService,
];
