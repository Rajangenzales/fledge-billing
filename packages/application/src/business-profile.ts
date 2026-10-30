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
  get: () => StoredBusiness | null;
  save: (record: StoredBusiness) => void;
};

export type BusinessProfileDeps = {
  repository: BusinessRepository;
  states: readonly StateUt[];
  now: () => string;
  createId: () => string;
};

export function getBusinessProfile(deps: BusinessProfileDeps): BusinessProfile | null {
  const stored = deps.repository.get();
  if (!stored) {
    return null;
  }
  return toProfile(stored, deps.states);
}

export function saveBusinessProfile(
  input: SaveBusinessProfileInput,
  deps: BusinessProfileDeps,
): BusinessProfile {
  const normalized = validateBusinessInput(input, deps.states);
  const existing = deps.repository.get();
  const timestamp = deps.now();
  const stored: StoredBusiness = {
    ...normalized,
    id: existing?.id ?? deps.createId(),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
  deps.repository.save(stored);
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
