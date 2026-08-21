/**
 * openInvoicePreview.js
 *
 * Opens the split-screen review window from the Generate button.
 *
 * The ordering here is the whole point. Extraction takes ten seconds to a
 * minute, and if window.open() runs after that await, every browser treats it
 * as a programmatic popup and blocks it. So the window opens first, inside the
 * click handler, on a loading route - then the draft is requested and the id
 * is handed over. The user's click is still "live" at that moment, so the
 * window is allowed.
 */

const WINDOW_FEATURES = [
  'noopener=no', // we need the handle back to pass the draft id
  'width=1600',
  'height=980',
  'menubar=no',
  'toolbar=no',
  'location=no',
  'status=no',
  'resizable=yes',
  'scrollbars=yes',
].join(',');

/**
 * @param {object}  args
 * @param {Function} args.startDraft  async () => ({ draftId }) - POSTs /api/invoices/drafts
 * @param {Function} [args.onBlocked] called when the browser refuses the window
 * @param {Function} [args.onApproved] called with { invoiceId, invoiceNumber }
 * @returns {Window|null}
 */
export const openInvoicePreview = ({ startDraft, onBlocked, onApproved }) => {
  const previewWindow = window.open(
    '/invoice-preview/pending',
    'crewio-invoice-preview',
    WINDOW_FEATURES
  );

  if (!previewWindow) {
    onBlocked?.();
    return null;
  }

  previewWindow.focus();

  // Listen for the approval so the list behind refreshes without a manual
  // reload. Same-origin only - the check is not optional.
  const handleMessage = (event) => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type === 'crewio:invoice-approved') {
      onApproved?.(event.data.payload);
      window.removeEventListener('message', handleMessage);
    }
  };
  window.addEventListener('message', handleMessage);

  startDraft()
    .then(({ draftId }) => {
      if (previewWindow.closed) return;
      previewWindow.location.replace(`/invoice-preview/${draftId}`);
    })
    .catch((error) => {
      if (previewWindow.closed) return;
      previewWindow.location.replace(
        `/invoice-preview/error?message=${encodeURIComponent(error.message)}`
      );
    });

  return previewWindow;
};

/**
 * Drop-in for the existing Generate button.
 *
 * <button onClick={() => handleGenerate(file)}>Generate invoice</button>
 */
export const makeGenerateHandler = ({
    invoicesApi,
    companyId,
    onApproved,
    onBlocked,
}) => (file) =>
    openInvoicePreview({
        onApproved,
        onBlocked,

        startDraft: async () => {

            // Upload the PDF
            const upload = await invoicesApi.uploadTimesheet(file);

            const pdfPath =
                upload.data?.path ||
                upload.data?.filePath;

            if (!pdfPath)
                throw new Error("Timesheet upload failed");

            // Create draft
            const { data } = await invoicesApi.generateDraft({
                pdfPath,
                companyId,
            });

            return {
                draftId: data.data.draftId,
            };
        },
    });