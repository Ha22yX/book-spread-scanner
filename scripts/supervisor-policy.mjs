export function shouldRestart({ now, lastPulse, jobStarted }) {
  return now - lastPulse > 120_000 || (jobStarted > 0 && now - jobStarted > 720_000);
}
