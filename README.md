# Handwritten PDF OCR

A local browser app for turning scanned handwritten PDFs into editable text.

## Run

From this folder:

```sh
npm install
npm start
```

Then open:

```txt
http://localhost:4174
```

The app uses PDF.js to render PDF pages and Tesseract.js to OCR the rendered page images. The browser libraries are installed with `npm install`.

## Notes

Handwriting OCR is imperfect. For best results, use clear scans, raise page detail for small writing, increase contrast for faint pencil, and try ink cleanup for noisy pages.

Language uses Tesseract codes. Common aliases are handled automatically: `en` becomes `eng`, `fr` becomes `fra`, `ru` becomes `rus`, and mixed inputs such as `en+fr` become `eng+fra`. First-time OCR for a language may need to download that Tesseract trained-data file.
