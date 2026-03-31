// BlueprintAI — Upload Flow with Progress Tracking
'use strict';

(function () {
  var api = window.__blueprintAI;
  if (!api) return;

  var API_BASE = '/api/v1';
  var isUploading = false;

  // Get API key from meta tag or empty string
  function getApiKey() {
    var meta = document.querySelector('meta[name="api-key"]');
    return meta ? meta.getAttribute('content') : '';
  }

  // Create a new extraction job
  function createJob() {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', API_BASE + '/jobs');
      xhr.setRequestHeader('Content-Type', 'application/json');
      var apiKey = getApiKey();
      if (apiKey) xhr.setRequestHeader('X-API-Key', apiKey);

      xhr.onload = function () {
        if (xhr.status === 201) {
          try {
            var data = JSON.parse(xhr.responseText);
            resolve(data.job_id);
          } catch (e) {
            reject(new Error('Error al procesar respuesta del servidor'));
          }
        } else {
          reject(new Error('Error al crear trabajo: ' + xhr.status));
        }
      };

      xhr.onerror = function () {
        reject(new Error('Error de red. Verifica tu conexion e intenta de nuevo.'));
      };

      xhr.send(JSON.stringify({}));
    });
  }

  // Upload files to a job with progress tracking
  function uploadFiles(jobId, files) {
    return new Promise(function (resolve, reject) {
      var formData = new FormData();
      for (var i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
      }

      var xhr = new XMLHttpRequest();
      xhr.open('POST', API_BASE + '/jobs/' + jobId + '/upload');
      var apiKey = getApiKey();
      if (apiKey) xhr.setRequestHeader('X-API-Key', apiKey);

      // Progress tracking
      xhr.upload.onprogress = function (e) {
        if (e.lengthComputable) {
          var pct = (e.loaded / e.total) * 100;
          var filesUploaded = Math.min(Math.round((e.loaded / e.total) * files.length), files.length);
          api.setProgress(
            pct,
            filesUploaded + ' de ' + files.length + ' subido' + (files.length !== 1 ? 's' : '') +
            ' (' + Math.round(pct) + '%)'
          );
        }
      };

      xhr.onload = function () {
        if (xhr.status === 202) {
          try {
            var data = JSON.parse(xhr.responseText);
            resolve(data);
          } catch (e) {
            reject(new Error('Error al procesar respuesta del servidor'));
          }
        } else if (xhr.status === 413) {
          reject(new Error('Archivo demasiado grande. El servidor rechaza archivos mayores al limite.'));
        } else if (xhr.status === 415) {
          try {
            var errData = JSON.parse(xhr.responseText);
            reject(new Error(errData.message || 'Tipo de archivo no valido'));
          } catch (e) {
            reject(new Error('Tipo de archivo no valido'));
          }
        } else if (xhr.status === 422 || xhr.status === 400) {
          try {
            var errData2 = JSON.parse(xhr.responseText);
            reject(new Error(errData2.message || 'Error de validacion'));
          } catch (e) {
            reject(new Error('Error de validacion'));
          }
        } else if (xhr.status >= 500) {
          reject(new Error('Error del servidor. Por favor intenta de nuevo mas tarde.'));
        } else {
          reject(new Error('Error inesperado: ' + xhr.status));
        }
      };

      xhr.onerror = function () {
        reject(new Error('Error de red. Verifica tu conexion e intenta de nuevo.'));
      };

      xhr.ontimeout = function () {
        reject(new Error('La carga agoto el tiempo de espera. Intenta de nuevo.'));
      };

      xhr.timeout = 300000; // 5 minutes

      xhr.send(formData);
    });
  }

  // Main upload flow
  async function startUpload() {
    if (isUploading) return;

    var files = api.getValidFiles();
    if (files.length === 0) return;

    isUploading = true;
    api.hideError();
    api.setUploading(true);
    api.showProgress(true);
    api.setProgress(0, 'Preparando carga...');
    api.announce('Iniciando carga de ' + files.length + ' archivo' + (files.length !== 1 ? 's' : ''));

    try {
      // Get or create job
      var jobId = api.existingJobId;
      if (!jobId) {
        api.setProgress(0, 'Creando trabajo...');
        jobId = await createJob();
      }

      // Store jobId
      sessionStorage.setItem('blueprintai_jobId', jobId);

      // Upload files
      var result = await uploadFiles(jobId, files);

      // Success
      api.setProgress(100, files.length + ' de ' + files.length + ' subidos (100%)');
      api.announce('Carga completada. Redirigiendo a resultados.');

      // Store upload summary for results page
      sessionStorage.setItem('blueprintai_uploadSummary', JSON.stringify({
        jobId: jobId,
        fileCount: files.length,
        totalSize: files.reduce(function (sum, f) { return sum + f.size; }, 0),
      }));

      // Redirect after 2 seconds
      setTimeout(function () {
        window.location.href = '/results.html?jobId=' + encodeURIComponent(jobId);
      }, 2000);

    } catch (err) {
      isUploading = false;
      api.setUploading(false);
      api.showProgress(false);
      api.showError(err.message || 'Error desconocido durante la carga');
      api.announce('Error: ' + (err.message || 'Error desconocido'));
    }
  }

  // Wire up
  api.setStartUpload(startUpload);
})();
