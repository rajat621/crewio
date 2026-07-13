import { parsePhoneNumberFromString } from "libphonenumber-js";
import { getCountryByIso, getCountryByPhoneCode } from "./locationService";

export const getMaxMobileDigits = ({ countryIso, countryCode }) => {
  const normalizedIso = String(countryIso || "").trim().toUpperCase();
  const matchedCountry = normalizedIso ? getCountryByIso(normalizedIso) : getCountryByPhoneCode(countryCode);

  if (matchedCountry?.isoCode) {
    return 15;
  }

  // Fallback when country is not recognized.
  return 15;
};

export const isValidMobileNumberByCountry = (inputValue, countryInfo) => {
  const phoneNumber = String(inputValue || "").trim();
  if (!phoneNumber) return false;

  const normalizedIso = String(countryInfo?.countryIso || countryInfo?.countryCode || "").trim().toUpperCase();
  const country = getCountryByIso(normalizedIso) || getCountryByPhoneCode(countryInfo?.countryCode);

  if (!country?.isoCode) {
    return /^\+?[\d\s()-]+$/.test(phoneNumber);
  }

  const parsed = parsePhoneNumberFromString(phoneNumber, country.isoCode);
  return Boolean(parsed?.isValid?.() ?? false);
};

export const clampMobileByCountry = (inputValue, countryInfo) => {
  const maxDigits = getMaxMobileDigits(countryInfo);
  let digitsUsed = 0;
  let output = "";

  for (const ch of inputValue) {
    if (/\d/.test(ch)) {
      if (digitsUsed >= maxDigits) {
        continue;
      }
      digitsUsed += 1;
      output += ch;
      continue;
    }

    output += ch;
  }

  return output;
};
