import "server-only";
import type { Prisma } from "@repo/database/generated/client";

export const xeroPersonMatchSelect = {
  candidate_person: {
    select: {
      email: true,
      first_name: true,
      last_name: true,
      user_id: true,
    },
  },
  id: true,
  xero_person: {
    select: {
      email: true,
      first_name: true,
      last_name: true,
    },
  },
} satisfies Prisma.XeroPersonMatchSelect;

export type XeroPersonMatchQueryResult = Prisma.XeroPersonMatchGetPayload<{
  select: typeof xeroPersonMatchSelect;
}>;

export interface XeroPersonCandidatePersonView {
  email: string;
  first_name: string;
  last_name: string;
  user_id: string | null;
}

export interface XeroPersonTargetView {
  email: string;
  first_name: string;
  last_name: string;
}

export interface XeroPersonMatchView {
  candidate_person: XeroPersonCandidatePersonView | null;
  id: string;
  xero_person: XeroPersonTargetView;
}

export function toXeroPersonMatchView(
  match: XeroPersonMatchQueryResult
): XeroPersonMatchView {
  return {
    candidate_person: match.candidate_person
      ? {
          email: match.candidate_person.email,
          first_name: match.candidate_person.first_name,
          last_name: match.candidate_person.last_name,
          user_id: match.candidate_person.user_id,
        }
      : null,
    id: match.id,
    xero_person: {
      email: match.xero_person.email,
      first_name: match.xero_person.first_name,
      last_name: match.xero_person.last_name,
    },
  };
}
