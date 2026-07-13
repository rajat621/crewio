export const validateEmail = (email) => {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
};

export const validatePhoneNumber = (phone) => {
  const regex = /^\+?[\d\s\-()]+$/;
  return regex.test(phone);
};

export default {
  validateEmail,
  validatePhoneNumber,
};


