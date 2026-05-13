let lastTeamCreateError = null;

export function setLastTeamCreateError(msg) {
  lastTeamCreateError = msg || null;
}

export function getLastTeamCreateError() {
  return lastTeamCreateError;
}
