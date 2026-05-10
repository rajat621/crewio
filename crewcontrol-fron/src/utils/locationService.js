import { City, Country, State } from "country-state-city";
import countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json";
import { getCountryCallingCode } from "libphonenumber-js";

countries.registerLocale(enLocale);

const countryCache = new Map();
const statesCache = new Map();
const citiesCache = new Map();

const FALLBACK_PHONE_CODE = "";

const normalizeIsoCode = (value) => String(value || "").trim().toUpperCase();

const createFlagCode = (isoCode) => normalizeIsoCode(isoCode);

const buildCountryRecord = (rawCountry) => {
  const isoCode = normalizeIsoCode(rawCountry?.isoCode || rawCountry?.countryCode || rawCountry?.code);
  if (!isoCode) return null;

  const name = countries.getName(isoCode, enLocale?.lang || "en") || rawCountry?.name || isoCode;
  const phoneCode = getPhoneCode(isoCode);

  return {
    name,
    isoCode,
    phoneCode,
    flag: createFlagCode(isoCode),
  };
};

export const getPhoneCode = (countryCode) => {
  const isoCode = normalizeIsoCode(countryCode);
  if (!isoCode) return FALLBACK_PHONE_CODE;

  try {
    return `+${getCountryCallingCode(isoCode)}`;
  } catch {
    return FALLBACK_PHONE_CODE;
  }
};

export const getCountries = () => {
  if (countryCache.size === 0) {
    Country.getAllCountries().forEach((country) => {
      const record = buildCountryRecord(country);
      if (record) {
        countryCache.set(record.isoCode, record);
      }
    });
  }

  return Array.from(countryCache.values()).sort((a, b) => a.name.localeCompare(b.name));
};

export const getCountryByIso = (countryCode) => {
  const isoCode = normalizeIsoCode(countryCode);
  if (!isoCode) return null;
  return countryCache.get(isoCode) || getCountries().find((country) => country.isoCode === isoCode) || null;
};

export const getCountryByPhoneCode = (phoneCode) => {
  const normalizedCode = String(phoneCode || "").trim();
  if (!normalizedCode) return null;

  return getCountries().find((country) => country.phoneCode === normalizedCode) || null;
};

export const getStates = (countryCode) => {
  const isoCode = normalizeIsoCode(countryCode);
  if (!isoCode) return [];

  if (!statesCache.has(isoCode)) {
    const stateList = State.getStatesOfCountry(isoCode).map((state) => ({
      name: state.name,
      isoCode: state.isoCode,
      countryCode: isoCode,
      flag: isoCode,
    }));

    statesCache.set(isoCode, stateList);
  }

  return statesCache.get(isoCode) || [];
};

export const getCities = (countryCode, stateCode) => {
  const isoCode = normalizeIsoCode(countryCode);
  const normalizedStateCode = String(stateCode || "").trim().toUpperCase();
  if (!isoCode || !normalizedStateCode) return [];

  const cacheKey = `${isoCode}:${normalizedStateCode}`;
  if (!citiesCache.has(cacheKey)) {
    const cityList = City.getCitiesOfState(isoCode, normalizedStateCode).map((city) => ({
      name: city.name,
      isoCode: city.name,
      countryCode: isoCode,
      stateCode: normalizedStateCode,
      flag: isoCode,
    }));

    citiesCache.set(cacheKey, cityList);
  }

  return citiesCache.get(cacheKey) || [];
};

export const getNationalityOptions = () => getCountries();

export const getCountrySelectOptions = () => getCountries();
