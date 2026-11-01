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
  getBusinessId: () => Promise<string | null>;
  list: () => Promise<StoredCustomer[]>;
  get: (id: string) => Promise<StoredCustomer | null>;
  insert: (record: StoredCustomer) => Promise<void>;
  update: (record: StoredCustomer) => Promise<void>;
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

export async function listCustomers(
  deps: CustomerDeps,
  options: { includeInactive?: boolean } = {},
): Promise<Customer[]> {
  return (await deps.repository.list())
    .filter((customer) => options.includeInactive || customer.active)
    .map((customer) => toCustomer(customer, deps.states));
}

export async function getCustomer(id: string, deps: CustomerDeps): Promise<Customer | null> {
  const stored = await deps.repository.get(id);
  return stored ? toCustomer(stored, deps.states) : null;
}

export async function createCustomer(input: SaveCustomerInput, deps: CustomerDeps): Promise<Customer> {
  const businessId = await requireBusiness(deps);
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
  await deps.repository.insert(stored);
  return toCustomer(stored, deps.states);
}

export async function updateCustomer(
  id: string,
  input: UpdateCustomerInput,
  deps: CustomerDeps,
): Promise<Customer> {
  const existing = await deps.repository.get(id);
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
  await deps.repository.update(stored);
  return toCustomer(stored, deps.states);
}

async function requireBusiness(deps: CustomerDeps): Promise<string> {
  const businessId = await deps.repository.getBusinessId();
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
  return { ...stored, creditDays: stored.creditDays ?? 0, stateUt };
}

export type { CustomerRegistrationType };
