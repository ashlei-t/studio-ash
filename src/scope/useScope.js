import { useContext } from "react";
import { ScopeContext } from "./context.js";

export function useScope() {
  return useContext(ScopeContext);
}
