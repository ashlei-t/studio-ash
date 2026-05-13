import { createContext } from "react";

export const ScopeContext = createContext({
  scope: { kind: "personal", id: null },
  teams: [],
  setScope: () => {},
  reloadTeams: async () => {},
  createTeam: async () => null,
  createInvite: async () => null,
  scopeVersion: 0,
});
