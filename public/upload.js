// BlueprintAI — Upload Flow with Progress Tracking
'use strict';

(function () {
  var api = window.__blueprintAI;
  if (!api) return;

  var API_BASE = '/api/v1';

  // Read API key from sessionStorage (user enters it once per session)
  function getApiKey() {
    var key = sessionStorage.getItem('blueprintai_apiKey');
    if (!key) {
      key = prompt('Introduce tu API Key para autenticarte:');
      if (key) {
        sessionStorage.setItem('blueprintai_apiKey', key);
      }
    }
    return key || '';
  }

  // Set auth headers on an XHR request
  function setAuthHeaders(xhr) {
    var key = getApiKey();
    if (key) {
      xhr.setRequestHeader('X-API-Key', key);
    }
  }

  // Check job status before adding more files
  function checkJobStatus(jobId) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', API_BASE + '/jobs/' + jobId);
      setAuthHeaders(xhr);

      xhr.onload = function () {
        if (xhr.status === 200) {
          try {
            var data = JSON.parse(xhr.responseText);
            resolve(data.status);
          } catch (e) {
            resolve('unknown');
          }
        } else if (xhr.status === 404) {
          resolve('not_found');
        } else {
          resolve('unknown');
        }
      };

      xhr.onerror = function () {
        resolve('unknown');
      };

      xhr.send();
    });
  }

  // Create a new extraction job
  function createJob() {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', API_BASE + '/jobs');
      xhr.setRequestHeader('Content-Type', 'application/json');
      setAuthHeaders(xhr);

      xhr.onload = function () {
        if (xhr.status === 201) {
          try {
            var data = JSON.parse(xhr.responseText);
            resolve(data.job_id);
          } catch (e) {
            reject(new Error('Error al procesar respuesta del servidor'));
          }
        } else if (xhr.status === 401) {
          reject(new Error('No autorizado. Verifica la configuracion de la API key.'));
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
      setAuthHeaders(xhr);

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
        } else if (xhr.status === 401) {
          reject(new Error('No autorizado. Verifica la configuracion de la API key.'));
        } else if (xhr.status === 413) {
          reject(new Error('Archivo demasiado grande. El servidor rechaza archivos mayores al limite.'));
        } else if (xhr.status === 409) {
          reject(new Error('No se pueden agregar archivos a este trabajo. El trabajo ya esta finalizado.'));
        } else if (xhr.status === 415) {
          reject(new Error('Tipo de archivo no valido'));
        } else if (xhr.status === 422 || xhr.status === 400) {
          reject(new Error('Error de validacion'));
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
    if (api.isUploading()) return;

    var files = api.getValidFiles();
    if (files.length === 0) return;

    api.hideError();
    api.setUploading(true);
    api.showProgress(true);
    api.setProgress(0, 'Preparando carga...');
    api.announce('Iniciando carga de ' + files.length + ' archivo' + (files.length !== 1 ? 's' : ''));

    try {
      // Get or create job
      var jobId = api.existingJobId;

      // Check if existing job is still accepting files
      if (jobId) {
        var status = await checkJobStatus(jobId);
        if (status === 'completed' || status === 'failed') {
          api.setUploading(false);
          api.showProgress(false);
          api.showError('Este trabajo ya esta ' + status + '. Crea uno nuevo.');
          return;
        }
        if (status === 'not_found') {
          // Job doesn't exist anymore, create a new one
          jobId = null;
          api.existingJobId = null;
          sessionStorage.removeItem('blueprintai_jobId');
        }
      }

      if (!jobId) {
        api.setProgress(0, 'Creando trabajo...');
        jobId = await createJob();
        // Persist jobId immediately so retries reuse the same job
        api.existingJobId = jobId;
        sessionStorage.setItem('blueprintai_jobId', jobId);
      }

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
        // Reset upload state in case redirect fails (e.g. results page not found)
        api.setUploading(false);
        window.location.href = '/results.html?jobId=' + encodeURIComponent(jobId);
      }, 2000);

    } catch (err) {
      api.setUploading(false);
      api.showProgress(false);
      api.showError(err.message || 'Error desconocido durante la carga');
      api.announce('Error: ' + (err.message || 'Error desconocido'));
    }
  }

  // Wire up
  api.setStartUpload(startUpload);
})();
