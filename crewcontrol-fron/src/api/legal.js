// crewcontrol-fron/src/api/legal.js
import api from './client'

export const legalApi = {
  // listDocuments removed (dead code cleanup) - zero usage anywhere in
  // the frontend; LEGAL_DOCUMENT_LINKS below (hardcoded metadata) is used
  // instead for the signup checkboxes.

  getDocument: (slug) => api.get(`/api/legal/documents/${slug}`),

  getStatus: () => api.get('/api/legal/status'),

  accept: () => api.post('/api/legal/accept', { accepted: true }),
}

// Fixed metadata for the 7 documents, used to render the signup checkbox
// links before any network call resolves. Order matches the consent label
// in the product spec. `slug` matches the backend's LEGAL_DOCUMENTS keys.
export const LEGAL_DOCUMENT_LINKS = [
  { slug: 'privacy-policy', title: 'Privacy Policy' },
  { slug: 'terms-and-conditions', title: 'Terms & Conditions' },
  { slug: 'terms-of-use', title: 'Terms of Use' },
  { slug: 'cookie-policy', title: 'Cookie Policy' },
  { slug: 'data-processing-agreement', title: 'Data Processing Agreement' },
  { slug: 'security-privacy-statement', title: 'Security & Privacy Policy' },
  { slug: 'data-retention-policy', title: 'Data Retention Policy' },
]
