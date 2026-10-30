import type { StateUt } from "@fledge/domain";
import {
  CustomerError,
  validateCustomerInput,
  type CustomerRegistrationType,
  type NormalizedCustomerInput,
  type SaveCustomerInput,
} from "@fledge/domain";

export type Customer = NormalizedCustomerInput & {
  id: string;
  businessId: string;
  stateUt: StateUt;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StoredCustomer = NormalizedCustomerInput & {
  id: string;
  businessId: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CustomerRepository = {
  getBusinessId: () => string | null;
  list: () => StoredCustomer[];
  get: (id: string) => StoredCustomer | null;
  insert: (record: StoredCustomer) => void;
  update: (record: StoredCustomer) => void;
};

export type CustomerDeps = {
  repository: CustomerRepository;
  states: readonly StateUt[];
  now: () => string;
  createId: () => string;
};

export type UpdateCustomerInput = SaveCustomerInput & {
  active?: boolean;
};

export function listCustomers(
  deps: CustomerDeps,
  options: { includeInactive?: boolean } = {},
): Customer[] {
  return deps.repository
    .list()
    .filter((customer) => options.includeInactive || customer.active)
    .map((customer) => toCustomer(customer, deps.states));
}

export function getCustomer(id: string, deps: CustomerDeps): Customer | null {
  const stored = deps.repository.get(id);
  if (!stored) {
    return null;
  }
  return toCustomer(stored, deps.states);
}

export function createCustomer(input: SaveCustomerInput, deps: CustomerDeps): Customer {
  const businessId = requireBusiness(deps);
  const normalized = validateCustomerInput(input, deps.states);
  const timestamp = deps.now();
  const stored: StoredCustomer = {
    ...normalized,
    id: deps.createId(),
    businessId,
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  deps.repository.insert(stored);
  return toCustomer(stored, deps.states);
}

export function updateCustomer(
  id: string,
  input: UpdateCustomerInput,
  deps: CustomerDeps,
): Customer {
  const existing = deps.repository.get(id);
  if (!existing) {
    throw new CustomerError("That customer was not found.");
  }
  const normalized = validateCustomerInput(input, deps.states);
  const stored: StoredCustomer = {
    ...normalized,
    id: existing.id,
    businessId: existing.businessId,
    active: input.active ?? existing.active,
    createdAt: existing.createdAt,
    updatedAt: deps.now(),
  };
  deps.repository.update(stored);
  return toCustomer(stored, deps.states);
}

function requireBusiness(deps: CustomerDeps): string {
  const businessId = deps.repository.getBusinessId();
  if (!businessId) {
    throw new CustomerError("Save the business profile before adding a customer.");
  }
  return businessId;
}

function toCustomer(stored: StoredCustomer, states: readonly StateUt[]): Customer {
  const stateUt = states.find((state) => state.id === stored.stateId);
  if (!stateUt) {
    throw new CustomerError("The saved customer State or Union Territory is missing from the master.");
  }
  return { ...stored, stateUt };
}

export type { CustomerRegistrationType };
