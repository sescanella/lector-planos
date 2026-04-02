(function () {
  'use strict';

  var params = new URLSearchParams(window.location.search);
  var jobId = params.get('jobId') || sessionStorage.getItem('blueprintai_jobId');

  if (!jobId) {
    document.getElementById('successCard').classList.add('hidden');
    document.getElementById('errorCard').classList.add('visible');
    return;
  }

  // Read upload summary from sessionStorage
  var summary = null;
  try {
    summary = JSON.parse(sessionStorage.getItem('blueprintai_uploadSummary'));
  } catch (e) { /* ignore */ }

  // Populate job ID
  document.getElementById('jobIdValue').textContent = jobId;

  // Populate summary if available
  if (summary) {
    document.getElementById('fileCountValue').textContent = summary.fileCount;
    document.getElementById('totalSizeValue').textContent = formatSize(summary.totalSize);
    document.getElementById('successText').textContent =
      'Tus ' + summary.fileCount + ' archivos han sido cargados exitosamente. El procesamiento comenzara inmediatamente.';
  }

  // Add more files link with jobId
  document.getElementById('addMoreBtn').href = '/?jobId=' + encodeURIComponent(jobId);

  // View results button (placeholder — job status page will come later)
  document.getElementById('viewResultsBtn').addEventListener('click', function () {
    // For now, show processing notice
    document.getElementById('redirectNotice').style.display = 'block';
    document.getElementById('redirectNotice').textContent = 'El visor de resultados estara disponible proximamente. ID de trabajo: ' + jobId;
  });

  function formatSize(bytes) {
    if (!bytes) return '-';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
})();
