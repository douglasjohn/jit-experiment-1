export function logFixation(fixation) {
  console.log(
    `Fixation: (${fixation.x.toFixed(3)}, ${fixation.y.toFixed(3)}) ${fixation.durationMs.toFixed(0)}ms`
  );
}