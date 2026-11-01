import type { StateUt } from "@fledge/domain";
import {
  BusinessProfileError,
  validateBusinessInput,
  type NormalizedBusinessInput,
  type SaveBusinessProfileInput,
} from "@fledge/domain";

export type BusinessProfile = NormalizedBusinessInput & {
  id: string;
  stateUt: StateUt;
  createdAt: string;
  updatedAt: string;
};

export type StoredBusiness = NormalizedBusinessInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export type BusinessRepository = {
  get: () => Promise<StoredBusiness | null>;
  save: (record: StoredBusiness) => Promise<void>;
};

export type BusinessProfileDeps = {
  repository: BusinessRepository;
  states: readonly StateUt[];
  now: () => string;
  createId: () => string;
};

export async function getBusinessProfile(deps: BusinessProfileDeps): Promise<BusinessProfile | null> {
  const stored = await deps.repository.get();
  return stored ? toProfile(stored, deps.states) : null;
}

export async function saveBusinessProfile(
  input: SaveBusinessProfileInput,
  deps: BusinessProfileDeps,
): Promise<BusinessProfile> {
  const normalized = validateBusinessInput(input, deps.states);
  const existing = await deps.repository.get();
  const timestamp = deps.now();
  const stored: StoredBusiness = {
    ...normalized,
    id: existing?.id ?? deps.createId(),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
  await deps.repository.save(stored);
  return toProfile(stored, deps.states);
}

function toProfile(stored: StoredBusiness, states: readonly StateUt[]): BusinessProfile {
  const stateUt = states.find((state) => state.id === stored.stateId);
  if (!stateUt) {
    throw new BusinessProfileError(
      "The saved business State or Union Territory is missing from the master.",
    );
  }
  return { ...stored, stateUt };
}
