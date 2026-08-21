import sharp from 'sharp';

// Logos/signatures/stamps are drawn into these PDFs at a few dozen points
// wide at most (see salarySlipPdf.service.js/invoiceRenderer.service.js -
// e.g. scaleToFit(46, 46)) - but without this, whatever the user actually
// uploaded (often a multi-megapixel phone photo or a several-hundred-KB
// PNG scan) gets embedded byte-for-byte at full resolution, with the PDF
// viewer doing nothing but shrinking it visually. This is the single
// biggest driver of oversized salary-slip/invoice PDFs: resizing to a
// sensible max dimension and re-compressing before embedding fixes it at
// the source instead of trying to compensate for it elsewhere.
//
// MAX_DIMENSION is generous relative to the ~46-90pt display sizes used in
// these PDFs (a few hundred px covers even a 3x-4x pixel-density print
// without carrying multi-megapixel source data along for nothing).
// MAX_DIMENSION is generous relative to the ~46-90pt display sizes used in
// these PDFs (a few hundred px covers even a 3x-4x pixel-density print
// without carrying multi-megapixel source data along for nothing). Callers
// embedding a full-page background (e.g. an invoice template image) should
// pass a larger explicit maxDimension - this default is sized for small
// icons (logo/signature/stamp), not full pages.
const DEFAULT_MAX_DIMENSION = 400;
const JPEG_QUALITY = 82;
const PNG_COMPRESSION_LEVEL = 9;

/**
 * Downscales (if needed) and re-compresses an image before it's embedded
 * into a PDF via pdf-lib's embedPng/embedJpg. Returns { bytes, mime } -
 * `mime` tells the caller which embed* method to use, since a PNG with no
 * real transparency gets converted to JPEG (much smaller for photos/scans)
 * while a PNG that actually uses alpha stays PNG so transparency survives.
 *
 * Never throws: if optimization fails for any reason (corrupt/unsupported
 * image data), the original bytes/mime are returned unchanged so a logo
 * that already renders correctly never regresses to "missing" because of
 * an optimization step failing.
 */
export const optimizeImageForPdf = async (bytes, mime, { maxDimension = DEFAULT_MAX_DIMENSION } = {}) => {
  try {
    const input = sharp(bytes, { failOn: 'none' });
    const metadata = await input.metadata();

    const needsResize =
      (metadata.width && metadata.width > maxDimension) ||
      (metadata.height && metadata.height > maxDimension);

    let pipeline = input;
    if (needsResize) {
      pipeline = pipeline.resize(maxDimension, maxDimension, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    // Keep real transparency as PNG (a signature/stamp scanned with a
    // transparent background needs it); everything else - logos and scans
    // that are visually "PNG" but fully opaque, which is most of them -
    // compresses far better as JPEG than as PNG.
    if (metadata.hasAlpha) {
      const outBytes = await pipeline.png({ compressionLevel: PNG_COMPRESSION_LEVEL }).toBuffer();
      return { bytes: outBytes, mime: 'image/png' };
    }

    const outBytes = await pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
    return { bytes: outBytes, mime: 'image/jpeg' };
  } catch (error) {
    console.error('[pdf-image-optimizer] falling back to original image bytes:', error.message);
    return { bytes, mime };
  }
};
