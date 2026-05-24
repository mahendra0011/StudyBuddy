async function extractPdfTextFromBuffer(buffer) {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await pdfjsLib.getDocument({
        data: new Uint8Array(buffer),
        disableWorker: true
    }).promise;
    const pageLimit = Math.min(pdf.numPages, 35);
    const pages = [];

    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const pageText = content.items
            .map(item => item.str || "")
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();

        if (pageText) {
            pages.push(`Page ${pageNumber}: ${pageText}`);
        }
    }

    return {
        text: pages.join("\n\n"),
        pageCount: pdf.numPages,
        pageLimit
    };
}

module.exports = {
    extractPdfTextFromBuffer
};
