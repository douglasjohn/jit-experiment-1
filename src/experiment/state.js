export const experimentState = {
  currentScreen: 'loading',
  currentTaskIndex: 0,
  currentTask: null,

  taskStartTime: null,
  taskEndTime: null,

  inTask: false
};

export function getState() {
  return experimentState;
}