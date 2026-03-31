// BlueprintAI — PDF Upload Interface
'use strict';

(function () {
  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
  const MAX_FILES = 200;
  const ALLOWED_TYPES = ['application/pdf'];
  const ALLOWED_EXTENSIONS = ['.pdf'];

  // State
  let selectedFiles = []; // Array of { id, file, valid, error }
  let fileIdCounter = 0;
  let uploadInProgress = false;

  // DOM elements
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const browseBtn = document.getElementById('browseBtn');
  const fileList = document.getElementById('fileList');
  const fileItems = document.getElementById('fileItems');
  const fileCountBadge = document.getElementById('fileCountBadge');
  const actionsBar = document.getElementById('actionsBar');
  const uploadBtn = document.getElementById('uploadBtn');
  const clearAllBtn = document.getElementById('clearAllBtn');
  const totalSize = document.getElementById('totalSize');
  const progressSection = document.getElementById('progressSection');
  const progressBar = document.getElementById('progressBar');
  const progressBarContainer = document.getElementById('progressBarContainer');
  const progressText = document.getElementById('progressText');
  const errorBanner = document.getElementById('errorBanner');
  const errorText = document.getElementById('errorText');
  const retryBtn = document.getElementById('retryBtn');
  const jobBanner = document.getElementById('jobBanner');
  const fileWarning = document.getElementById('fileWarning');
  const announcer = document.getElementById('announcer');

  // --- Announce to screen readers ---
  function announce(message) {
    announcer.textContent = '';
    // Force reflow so aria-live picks up the change
    void announcer.offsetHeight;
    announcer.textContent = message;
  }

  // --- File validation ---
  function validateFile(file) {
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXTENSIONS.includes(ext)) {
      return { valid: false, error: 'Tipo de archivo no valido (debe ser PDF)' };
    }
    if (file.size > MAX_FILE_SIZE) {
      return { valid: false, error: 'El archivo excede 50 MB' };
    }
    return { valid: true, error: null };
  }

  // --- Add files ---
  function addFiles(fileArray) {
    const remaining = MAX_FILES - selectedFiles.length;
    let countLimitHit = false;
    let skippedCount = 0;

    for (let i = 0; i < fileArray.length; i++) {
      if (selectedFiles.length >= MAX_FILES) {
        countLimitHit = true;
        break;
      }

      const file = fileArray[i];
      // Prevent duplicate by name+size
      const isDuplicate = selectedFiles.some(
        (sf) => sf.file.name === file.name && sf.file.size === file.size
      );
      if (isDuplicate) {
        skippedCount++;
        continue;
      }

      const validation = validateFile(file);
      selectedFiles.push({
        id: ++fileIdCounter,
        file: file,
        valid: validation.valid,
        error: validation.error,
      });
    }

    if (countLimitHit) {
      announce('Maximo 200 archivos alcanzado');
      fileWarning.textContent = 'Maximo 200 archivos alcanzado. Elimina archivos para agregar mas.';
      fileWarning.style.display = 'block';
    } else {
      const added = Math.min(fileArray.length - skippedCount, remaining);
      announce(added + ' archivo' + (added !== 1 ? 's' : '') + ' agregado' + (added !== 1 ? 's' : ''));
    }

    if (skippedCount > 0) {
      announce(skippedCount + ' archivo' + (skippedCount !== 1 ? 's' : '') + ' duplicado' + (skippedCount !== 1 ? 's' : '') + ' omitido' + (skippedCount !== 1 ? 's' : ''));
    }

    renderFileList();
    updateUI();
  }

  // --- Remove file ---
  function removeFile(id) {
    if (uploadInProgress) return;
    const file = selectedFiles.find((f) => f.id === id);
    const removedIndex = selectedFiles.findIndex((f) => f.id === id);
    selectedFiles = selectedFiles.filter((f) => f.id !== id);
    if (file) {
      announce(file.file.name + ' eliminado');
    }
    renderFileList();
    updateUI();
    // Focus management: move focus to next remove button, or previous, or drop zone
    if (selectedFiles.length > 0) {
      var focusIndex = Math.min(removedIndex, selectedFiles.length - 1);
      var targetId = selectedFiles[focusIndex].id;
      var targetBtn = fileItems.querySelector('[data-remove-id="' + targetId + '"]');
      if (targetBtn) targetBtn.focus();
    } else {
      dropZone.focus();
    }
  }

  // --- Clear all ---
  function clearAll() {
    if (uploadInProgress) return;
    selectedFiles = [];
    announce('Todos los archivos eliminados');
    renderFileList();
    updateUI();
    dropZone.focus();
  }

  // --- Format file size ---
  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  // --- Render file list ---
  function renderFileList() {
    fileItems.innerHTML = '';

    selectedFiles.forEach(function (entry) {
      var li = document.createElement('li');
      li.className = 'file-item' + (entry.valid ? '' : ' invalid');
      li.setAttribute('data-file-id', entry.id);

      var statusHtml = entry.valid
        ? '<span class="status-badge status-valid"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg> Valido</span>'
        : '<span class="status-badge status-error"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> Error</span>';

      var errorHtml = entry.error
        ? '<div class="file-error">' + escapeHtml(entry.error) + '</div>'
        : '';

      li.innerHTML =
        '<div class="file-info">' +
        '  <div class="file-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>' +
        '  <div class="file-details">' +
        '    <div class="file-name" title="' + escapeHtml(entry.file.name) + '">' + escapeHtml(entry.file.name) + '</div>' +
        '    <div class="file-meta">' + formatSize(entry.file.size) + '</div>' +
        errorHtml +
        '  </div>' +
        '</div>' +
        '<div class="file-status">' + statusHtml + '</div>' +
        '<button class="btn-remove" type="button" aria-label="Eliminar ' + escapeHtml(entry.file.name) + '" data-remove-id="' + entry.id + '">' +
        '  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>';

      fileItems.appendChild(li);
    });
  }

  // --- Update UI state ---
  function updateUI() {
    var hasFiles = selectedFiles.length > 0;
    var validFiles = selectedFiles.filter(function (f) { return f.valid; });
    var hasValidFiles = validFiles.length > 0;

    // File list visibility
    fileList.classList.toggle('visible', hasFiles);
    actionsBar.classList.toggle('visible', hasFiles);

    // File warning visibility
    fileWarning.style.display = selectedFiles.length >= MAX_FILES ? 'block' : 'none';

    // File count badge
    fileCountBadge.textContent = selectedFiles.length + ' archivo' + (selectedFiles.length !== 1 ? 's' : '') + ' seleccionado' + (selectedFiles.length !== 1 ? 's' : '');

    // Upload button
    uploadBtn.disabled = !hasValidFiles;

    // Total size
    var total = validFiles.reduce(function (sum, f) { return sum + f.file.size; }, 0);
    totalSize.textContent = 'Total: ' + formatSize(total);
  }

  // --- Escape HTML ---
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML.replace(/"/g, '&quot;');
  }

  // --- Drag-and-drop events ---
  var dragCounter = 0;

  dropZone.addEventListener('dragenter', function (e) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter++;
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragover', function (e) {
    e.preventDefault();
    e.stopPropagation();
  });

  dropZone.addEventListener('dragleave', function (e) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      dropZone.classList.remove('drag-over');
    }
  });

  dropZone.addEventListener('drop', function (e) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter = 0;
    dropZone.classList.remove('drag-over');

    var files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      addFiles(files);
    }
  });

  // --- Click to browse ---
  dropZone.addEventListener('click', function (e) {
    if (uploadInProgress) return;
    // Don't trigger file input if clicking the browse button (it handles itself)
    if (e.target === browseBtn || browseBtn.contains(e.target)) return;
    fileInput.click();
  });

  dropZone.addEventListener('keydown', function (e) {
    if (uploadInProgress) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });

  browseBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    fileInput.click();
  });

  fileInput.addEventListener('change', function () {
    if (fileInput.files && fileInput.files.length > 0) {
      addFiles(Array.from(fileInput.files));
    }
    // Reset so the same files can be re-selected
    fileInput.value = '';
  });

  // --- Remove file (event delegation) ---
  fileItems.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-remove-id]');
    if (btn) {
      var id = parseInt(btn.getAttribute('data-remove-id'), 10);
      removeFile(id);
    }
  });

  // --- Clear all ---
  clearAllBtn.addEventListener('click', clearAll);

  // --- Upload flow (placeholder — implemented in TASK 3) ---
  uploadBtn.addEventListener('click', function () {
    startUpload();
  });

  // --- Retry ---
  retryBtn.addEventListener('click', function () {
    errorBanner.classList.remove('visible');
    startUpload();
  });

  // --- Upload implementation ---
  function startUpload() {
    // Will be implemented in TASK 3
    console.log('Upload triggered — implementation pending');
  }

  // --- Expose for TASK 3/4 ---
  window.__blueprintAI = {
    getValidFiles: function () {
      return selectedFiles.filter(function (f) { return f.valid; }).map(function (f) { return f.file; });
    },
    getSelectedFiles: function () { return selectedFiles; },
    showProgress: function (visible) { progressSection.classList.toggle('visible', visible); },
    setProgress: function (pct, text) {
      progressBar.style.width = pct + '%';
      progressBarContainer.setAttribute('aria-valuenow', Math.round(pct));
      progressText.textContent = text;
    },
    showError: function (msg) {
      errorText.textContent = msg;
      errorBanner.classList.add('visible');
    },
    hideError: function () { errorBanner.classList.remove('visible'); },
    setUploading: function (uploading) {
      uploadInProgress = uploading;
      dropZone.classList.toggle('uploading', uploading);
      dropZone.setAttribute('aria-disabled', uploading ? 'true' : 'false');
      var mainContent = document.querySelector('.main-content');
      if (mainContent) {
        mainContent.setAttribute('aria-busy', uploading ? 'true' : 'false');
      }
      uploadBtn.disabled = uploading;
      browseBtn.disabled = uploading;
      clearAllBtn.disabled = uploading;
      // Disable/enable all remove buttons
      var removeBtns = fileItems.querySelectorAll('.btn-remove');
      for (var i = 0; i < removeBtns.length; i++) {
        removeBtns[i].disabled = uploading;
      }
      // When re-enabling, let updateUI recalculate correct disabled states
      if (!uploading) {
        updateUI();
      }
    },
    isUploading: function () { return uploadInProgress; },
    announce: announce,
    setJobBanner: function (text) {
      jobBanner.textContent = text;
      jobBanner.classList.toggle('visible', !!text);
    },
    setStartUpload: function (fn) { startUpload = fn; },
  };

  // --- Check for existing jobId in URL ---
  var params = new URLSearchParams(window.location.search);
  var existingJobId = params.get('jobId') || sessionStorage.getItem('blueprintai_jobId');
  if (existingJobId) {
    window.__blueprintAI.setJobBanner('Agregando archivos al trabajo ' + existingJobId.substring(0, 8) + '...');
    window.__blueprintAI.existingJobId = existingJobId;
  }
})();
