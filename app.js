const pdfjsLib = window.pdfjsLib;

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "./node_modules/pdfjs-dist/build/pdf.worker.min.js";

const state = {
  file: null,
  pdf: null,
  pageCanvases: [],
  running: false,
  worker: null,
};

const els = {
  dropzone: document.querySelector("#dropzone"),
  fileInput: document.querySelector("#fileInput"),
  fileName: document.querySelector("#fileName"),
  language: document.querySelector("#language"),
  mode: document.querySelector("#mode"),
  scale: document.querySelector("#scale"),
  scaleValue: document.querySelector("#scaleValue"),
  contrast: document.querySelector("#contrast"),
  contrastValue: document.querySelector("#contrastValue"),
  threshold: document.querySelector("#threshold"),
  runButton: document.querySelector("#runButton"),
  clearButton: document.querySelector("#clearButton"),
  copyButton: document.querySelector("#copyButton"),
  downloadButton: document.querySelector("#downloadButton"),
  output: document.querySelector("#output"),
  previewGrid: document.querySelector("#previewGrid"),
  pageSummary: document.querySelector("#pageSummary"),
  resultSummary: document.querySelector("#resultSummary"),
  progress: document.querySelector("#progress"),
  engineStatus: document.querySelector("#engineStatus"),
  modeHint: document.querySelector("#modeHint"),
};

const MODE_SETTINGS = {
  notes: {
    label: "Notes",
    psm: "6",
    preserveSpaces: "1",
    whitelist: "",
    hint: "Notes mode is best for paragraphs and ordinary handwriting.",
  },
  math: {
    label: "Equations",
    psm: "11",
    preserveSpaces: "1",
    whitelist:
      "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸàâäçéèêëîïôöùûüÿŒœ+-=×÷*/^_()[]{}<>|.,:;!?'\"%∞√∑∫∂∆πθλμσΩαβγ",
    hint:
      "Equations mode preserves spacing and allows common math symbols, but it is still OCR, not full LaTeX reconstruction.",
  },
  layout: {
    label: "Loose layout",
    psm: "3",
    preserveSpaces: "1",
    whitelist: "",
    hint: "Loose layout mode is better for pages with separated notes, diagrams, and scattered formulas.",
  },
};

const LANGUAGE_ALIASES = {
  en: "eng",
  english: "eng",
  fr: "fra",
  french: "fra",
  francais: "fra",
  "français": "fra",
  ru: "rus",
  russian: "rus",
};

function setStatus(text, busy = false) {
  els.engineStatus.classList.toggle("busy", busy);
  els.engineStatus.lastChild.textContent = ` ${text}`;
}

function setProgress(value) {
  els.progress.value = Math.max(0, Math.min(100, value));
}

function updateButtons() {
  const hasPdf = Boolean(state.pdf);
  const hasText = els.output.value.trim().length > 0;
  els.runButton.disabled = !hasPdf || state.running;
  els.copyButton.disabled = !hasText;
  els.downloadButton.disabled = !hasText;
}

function resetApp() {
  state.file = null;
  state.pdf = null;
  state.pageCanvases = [];
  state.running = false;
  els.fileInput.value = "";
  els.fileName.textContent = "or drop one here";
  els.previewGrid.replaceChildren();
  els.output.value = "";
  els.pageSummary.textContent = "No PDF loaded";
  els.resultSummary.textContent = "Waiting for OCR";
  els.modeHint.textContent = getModeSettings().hint;
  setProgress(0);
  setStatus("Ready");
  updateButtons();
}

function getModeSettings() {
  return MODE_SETTINGS[els.mode.value] || MODE_SETTINGS.notes;
}

function normalizeLanguage(input) {
  const raw = (input || "eng").trim().toLowerCase();
  const parts = raw
    .split(/[,+\s]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => LANGUAGE_ALIASES[part] || part);

  return [...new Set(parts.length ? parts : ["eng"])].join("+");
}

async function getWorker(language, logger) {
  if (state.worker) {
    await state.worker.terminate();
    state.worker = null;
  }

  state.worker = await Tesseract.createWorker(language, 1, {
    workerPath: "./node_modules/tesseract.js/dist/worker.min.js",
    corePath: "./node_modules/tesseract.js-core",
    workerBlobURL: false,
    logger,
  });

  return state.worker;
}

function preprocessCanvas(sourceCanvas) {
  const canvas = document.createElement("canvas");
  canvas.width = sourceCanvas.width;
  canvas.height = sourceCanvas.height;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(sourceCanvas, 0, 0);

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  const contrast = Number(els.contrast.value);
  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const useThreshold = els.threshold.checked;

  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    let value = factor * (gray - 128) + 128;
    value = Math.max(0, Math.min(255, value));
    if (useThreshold) value = value < 178 ? 0 : 255;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }

  ctx.putImageData(image, 0, 0);
  return canvas;
}

async function renderPdf(file) {
  setStatus("Loading PDF", true);
  setProgress(0);
  els.previewGrid.replaceChildren();
  els.output.value = "";
  updateButtons();

  const data = await file.arrayBuffer();
  state.pdf = await pdfjsLib.getDocument({ data }).promise;
  state.pageCanvases = [];

  const scale = Number(els.scale.value);
  els.pageSummary.textContent = `${state.pdf.numPages} page${state.pdf.numPages === 1 ? "" : "s"}`;

  for (let pageNumber = 1; pageNumber <= state.pdf.numPages; pageNumber += 1) {
    const page = await state.pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { alpha: false });

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvasContext: ctx, viewport }).promise;

    const card = document.createElement("article");
    card.className = "page-card";
    card.append(canvas);

    const caption = document.createElement("div");
    caption.className = "page-caption";
    caption.innerHTML = `<span>Page ${pageNumber}</span><span id="pageStatus-${pageNumber}">Ready</span>`;
    card.append(caption);

    els.previewGrid.append(card);
    state.pageCanvases.push(canvas);
    setProgress((pageNumber / state.pdf.numPages) * 30);
  }

  setProgress(30);
  setStatus("PDF ready");
  updateButtons();
}

async function handleFile(file) {
  if (!file || file.type !== "application/pdf") {
    setStatus("Choose a PDF");
    return;
  }

  state.file = file;
  els.fileName.textContent = file.name;

  try {
    await renderPdf(file);
  } catch (error) {
    console.error(error);
    resetApp();
    setStatus("Could not open PDF");
  }
}

async function runOcr() {
  if (!state.pdf || state.running) return;

  state.running = true;
  els.output.value = "";
  els.resultSummary.textContent = "Extracting";
  setStatus("OCR running", true);
  setProgress(30);
  updateButtons();

  const language = normalizeLanguage(els.language.value);
  els.language.value = language;
  const mode = getModeSettings();
  const pageTexts = [];

  try {
    setStatus(`Loading ${language}`, true);
    const worker = await getWorker(language, (message) => {
      if (message.status === "loading tesseract core") setStatus("Loading OCR", true);
      if (message.status === "loading language traineddata") setStatus("Loading language", true);
    });

    await worker.setParameters({
      tessedit_pageseg_mode: mode.psm,
      preserve_interword_spaces: mode.preserveSpaces,
      tessedit_char_whitelist: mode.whitelist,
      user_defined_dpi: "300",
    });

    for (let index = 0; index < state.pageCanvases.length; index += 1) {
      const pageNumber = index + 1;
      const pageStatus = document.querySelector(`#pageStatus-${pageNumber}`);
      pageStatus.textContent = "Reading";

      const cleanCanvas = preprocessCanvas(state.pageCanvases[index]);
      const result = await worker.recognize(cleanCanvas, {}, { text: true, blocks: true });

      const text = result.data.text.trim();
      pageTexts.push(formatPageText(pageNumber, text, mode));
      els.output.value = pageTexts.join("\n\n");
      pageStatus.textContent = text ? "Done" : "Empty";
      setProgress(30 + ((index + 1) / state.pageCanvases.length) * 70);
    }

    setProgress(100);
    setStatus("Done");
    els.resultSummary.textContent = `${els.output.value.trim().split(/\s+/).filter(Boolean).length} words`;
  } catch (error) {
    console.error(error);
    setStatus("OCR failed");
    els.resultSummary.textContent = "Check browser console";
  } finally {
    if (state.worker) {
      await state.worker.terminate();
      state.worker = null;
    }
    state.running = false;
    updateButtons();
  }
}

function formatPageText(pageNumber, text, mode) {
  const body = text || "[No text found]";

  if (mode === MODE_SETTINGS.math) {
    return [
      `Page ${pageNumber}`,
      "[Math OCR draft: check equations against the image]",
      body,
    ].join("\n");
  }

  return `Page ${pageNumber}\n${body}`;
}

async function copyText() {
  await navigator.clipboard.writeText(els.output.value);
  setStatus("Copied");
}

function downloadText() {
  const baseName = state.file?.name?.replace(/\.pdf$/i, "") || "handwritten-pdf";
  const blob = new Blob([els.output.value], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${baseName}.txt`;
  link.click();
  URL.revokeObjectURL(url);
}

els.fileInput.addEventListener("change", (event) => handleFile(event.target.files[0]));
els.runButton.addEventListener("click", runOcr);
els.clearButton.addEventListener("click", resetApp);
els.copyButton.addEventListener("click", copyText);
els.downloadButton.addEventListener("click", downloadText);
els.output.addEventListener("input", updateButtons);

els.scale.addEventListener("input", () => {
  els.scaleValue.textContent = `${Number(els.scale.value).toFixed(1)}x`;
});

els.scale.addEventListener("change", () => {
  if (state.file && !state.running) renderPdf(state.file);
});

els.contrast.addEventListener("input", () => {
  els.contrastValue.textContent = els.contrast.value;
});

els.mode.addEventListener("change", () => {
  els.modeHint.textContent = getModeSettings().hint;
});

["dragenter", "dragover"].forEach((name) => {
  els.dropzone.addEventListener(name, (event) => {
    event.preventDefault();
    els.dropzone.classList.add("dragging");
  });
});

["dragleave", "drop"].forEach((name) => {
  els.dropzone.addEventListener(name, (event) => {
    event.preventDefault();
    els.dropzone.classList.remove("dragging");
  });
});

els.dropzone.addEventListener("drop", (event) => {
  handleFile(event.dataTransfer.files[0]);
});

if (window.lucide) {
  window.lucide.createIcons();
}

resetApp();
