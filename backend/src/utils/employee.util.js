export const createEmployeeCode = (name, timestamp) => {
  return `EMP-${name.slice(0, 3).toUpperCase()}-${timestamp}`;
};

export default { createEmployeeCode };


